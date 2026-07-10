async function refreshAccessToken() {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    const data = await res.json();

    if (!res.ok) {
      localStorage.clear();
      window.location.href = './pages/login.html';
      return null;
    }

    localStorage.setItem('token', data.token);
    return data.token;
  } catch (error) {
    localStorage.clear();
    window.location.href = './pages/login.html';
    return null;
  }
}

//AUTH CHECK
const token = localStorage.getItem('token');
const myUserId = localStorage.getItem('userId');
const myUsername = localStorage.getItem('username');

if (!token || !myUserId || !myUsername) {
  window.location.href = './pages/login.html';
}

// Connect to server with jwt
const socket = io({
  auth: { token },
});

//failure - token expired or invalid
socket.on('connect_error', async (error) => {
  if (error.message === 'Token expired') {
    const newToken = await refreshAccessToken();

    if (newToken) {
      socket.auth.token = newToken;
      socket.connect();
    }

    return;
  }

  if (
    error.message === 'Invalid token' ||
    error.message === 'No token provided'
  ) {
    localStorage.clear();
    window.location.href = './pages/login.html';
  }
});

// DOM elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const leaveBtn = document.getElementById('leave-btn');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const roomLabel = document.getElementById('room-label');
const peopleCount = document.getElementById('people-count');

//showing logged in username on join screen
document.getElementById('welcome-msg').textContent = `Welcome, ${myUsername}`;

// JOIN ROOM !!

joinBtn.addEventListener('click', () => {
  const roomCode = roomInput.value.trim();

  if (!roomCode) return showJoinError('Please enter a room code');

  // Emit join room event to server, sending only roomCode, username comes from socket.username on server
  socket.emit('join-room', roomCode);

  // Switch Screen
  joinScreen.style.display = 'none';
  chatScreen.style.display = 'block';
  roomLabel.textContent = `Room: ${roomCode}`;

  //showing spinner while past messages load
  loadingSpinner.style.display = 'flex';
});

roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const roomCode = roomInput.value.trim();

    if (!roomCode) return showJoinError('Please enter a room code');

    // Emit join room event to server
    socket.emit('join-room', roomCode);

    // Switch Screen
    joinScreen.style.display = 'none';
    chatScreen.style.display = 'block';
    roomLabel.textContent = `Room: ${roomCode}`;

    //showing spinner while past messages load
    loadingSpinner.style.display = 'flex';
  }
});

leaveBtn.addEventListener('click', () => {
  //telling server that a person is leaving
  socket.emit('leave-room');

  //resetting UI back to join screen
  joinScreen.style.display = 'block';
  chatScreen.style.display = 'none';
  messagesDiv.innerHTML = '';
  roomInput.value = '';
});

//LOG OUT
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Logout failed:', error);
  }

  localStorage.clear();
  window.location.href = './pages/login.html';
});

// SEND MESSAGE

messageInput.addEventListener('input', () => {
  updateCharCount(messageInput.value.length);
});

function updateCharCount(length) {
  const counter = document.getElementById('char-count');
  if (!counter) return;

  counter.textContent = `${length}/1000`;
  counter.style.color = length > 950 ? '#e74c3c' : '#999';
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

let lastMessageTime = 0;

function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  //frontend message rate limit check
  const now = Date.now();
  if (now - lastMessageTime < 500) {
    showChatError('Slow down, you are sending messages too fast !');
    return;
  }

  lastMessageTime = now;

  if (message.length > 1000) {
    showChatError('Message is too long.');
    return;
  }

  // Emit to server
  socket.emit('send-message', { message });

  // Show your own message immediately, dont wait for server echo
  addMessage({
    userId: myUserId,
    username: myUsername,
    message,
    time: new Date().toLocaleTimeString(),
  });

  messageInput.value = '';
  updateCharCount(0);
}

// Listen for events from server

//loading the messages when joining
socket.on('load-past-messages', (messages) => {
  //hide spinner
  loadingSpinner.style.display = 'none';

  if (messages.length === 0) return;
  addSystemMessage('--- Previous Messages ---');

  messages.forEach(({ userId, username, message, time }) => {
    addMessage({
      userId,
      username,
      message,
      time: new Date(time).toLocaleTimeString(),
    });
  });

  addSystemMessage('--- End of History ---');
});

//someone joined
socket.on('user-joined', ({ message, users }) => {
  addSystemMessage(message);
  updatePeopleCount(users.length);
});

//someone left
socket.on('user-left', ({ message, users }) => {
  addSystemMessage(message);
  updatePeopleCount(users.length);
});

//receive a message from someone else
socket.on('receive-message', ({ userId, username, message, time }) => {
  //ignoring our own messages (the user joined), rendered already
  if (userId === myUserId) return;

  addMessage({ userId, username, message, time });
});

socket.on('error-message', (message) => {
  showChatError(message);
});

// HELPER FUNCTIONS

function addMessage({ userId, username, message, time }) {
  //Dont show own message twice,we did it already
  const isSelf = userId === myUserId;

  const div = document.createElement('div');
  div.className = 'message';

  div.style.background = isSelf ? '#e8f0fe' : '#f0f0f0';
  div.style.alignSelf = isSelf ? 'flex-end' : 'flex-start';

  //building meta line safely
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${isSelf ? 'You' : username} - ${time}`;

  //building message text safely
  const text = document.createElement('div');
  text.textContent = message;

  div.appendChild(meta);
  div.appendChild(text);

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = text;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updatePeopleCount(count) {
  peopleCount.textContent = `${count} ${count === 1 ? 'person' : 'people'} in this room`;
}

function showJoinError(message) {
  const existing = document.getElementById('join-error');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'join-error';
  div.style.cssText = 'color: #e74c3c; font-size: 13px; margin-bottom: 10px';
  div.textContent = message;

  joinBtn.insertAdjacentElement('beforebegin', div);
}

function showChatError(message) {
  const existing = document.getElementById('chat-error');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'chat-error';
  div.textContent = message;
  div.style.cssText = `
  background: #fef2f2;
  color: #e74c3c;
  font-size: 12px;
  padding: 6px 12px;
  text-align: center;
  border-top: 1px solid #fecaca;
  `;

  //inserting it above the message form
  const messageForm = document.getElementById('message-form');
  messageForm.insertAdjacentElement('beforebegin', div);

  //auto remove after 3 seconds:
  setTimeout(() => {
    div.remove();
  }, 3000);
}
