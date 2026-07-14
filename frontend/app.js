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

let currentRoomCode = null;

if (!token || !myUserId || !myUsername) {
  window.location.href = './pages/login.html';
} else {
  // Connect to server with jwt
  const socket = io({
    auth: { token },
  });

  //typing UI
  let isTyping = false;
  let typingTimeout = null;
  const typingUsers = new Set();

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

  socket.on('connect', () => {
    if (currentRoomCode && chatScreen.style.display === 'block') {
      socket.emit('join-room', {
        roomCode: currentRoomCode,
        loadHistory: false,
      });
    }
  });

  function joinRoom(roomCode, loadHistory = true) {
    currentRoomCode = roomCode;

    socket.emit('join-room', {
      roomCode,
      loadHistory,
    });

    joinScreen.style.display = 'none';
    chatScreen.style.display = 'block';
    roomLabel.textContent = `Room: ${roomCode}`;

    if (loadHistory) {
      loadingSpinner.style.display = 'flex';
    }
  }

  //showing logged in username on join screen
  document.getElementById('welcome-msg').textContent = `Welcome, ${myUsername}`;

  // JOIN ROOM !!

  joinBtn.addEventListener('click', () => {
    const roomCode = roomInput.value.trim();

    if (!roomCode) return showJoinError('Please enter a room code');

    if (roomCode.length < 4 || roomCode.length > 20) {
      return showJoinError('Room code must be between 4 to 20 characters');
    }

    joinRoom(roomCode);
  });

  roomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const roomCode = roomInput.value.trim();

      if (!roomCode) return showJoinError('Please enter a room code');

      if (roomCode.length < 4 || roomCode.length > 20) {
        return showJoinError('Room code must be between 4 to 20 characters');
      }

      joinRoom(roomCode);
    }
  });

  leaveBtn.addEventListener('click', () => {
    //telling server that a person is leaving
    socket.emit('leave-room');

    currentRoomCode = null;

    //clearing typing state when leaving the room
    clearTimeout(typingTimeout);
    isTyping = false;
    typingUsers.clear();
    updateTypingIndicator();

    //resetting UI back to join screen
    joinScreen.style.display = 'block';
    chatScreen.style.display = 'none';
    messagesDiv.innerHTML = '';
    roomInput.value = '';

    // Clear any previous validation errors
    const existing = document.getElementById('join-error');

    if (existing) existing.remove();
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

    if (messageInput.value.trim().length === 0) {
      //if input is cleared stop showing typing
      if (isTyping) {
        isTyping = false;
        socket.emit('stop-typing');
        clearTimeout(typingTimeout);
      }
    } else {
      // If user starts typing
      if (!isTyping) {
        isTyping = true;
        socket.emit('typing');
      }

      //Reset the 2 sec timeout to check when they stop key presses
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        if (isTyping) {
          isTyping = false;
          socket.emit('stop-typing');
        }
      }, 2000);
    }
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

    //clear typing timeout and emit stop-typing
    clearTimeout(typingTimeout);
    if (isTyping) {
      isTyping = false;
      socket.emit('stop-typing');
    }
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

    //Clean up typing users who left the room
    const activeUsernames = new Set(users.map((u) => u.username));
    for (const user of typingUsers) {
      if (!activeUsernames.has(user)) {
        typingUsers.delete(user);
      }
    }
    updateTypingIndicator();
  });

  //listening for typing event from other users
  socket.on('user-typing', ({ username }) => {
    typingUsers.add(username);
    updateTypingIndicator();
  });

  socket.on('user-stop-typing', ({ username }) => {
    typingUsers.delete(username);
    updateTypingIndicator();
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

  function updateTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (!indicator) return;

    const usersArray = Array.from(typingUsers);

    if (usersArray.length === 0) {
      indicator.textContent = '';
      indicator.style.display = 'none';
    } else if (usersArray.length === 1) {
      indicator.textContent = `${usersArray[0]} is typing...`;
      indicator.style.display = 'block';
    } else if (usersArray.length === 2) {
      indicator.textContent = `${usersArray[0]} and ${usersArray[1]} are typing...`;
      indicator.style.display = 'block';
    } else {
      indicator.textContent = `${usersArray.slice(0, -1).join(', ')}, and ${usersArray[usersArray.length - 1]} are typing...`;
      indicator.style.display = 'none';
    }
  }

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
}
