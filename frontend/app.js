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
  const tabJoin = document.getElementById('tab-join');
  const tabCreate = document.getElementById('tab-create');
  const joinFormContainer = document.getElementById('join-form-container');
  const createFormContainer = document.getElementById('create-form-container');
  const createRoomInput = document.getElementById('create-room-input');
  const roomDuration = document.getElementById('room-duration');
  const createBtn = document.getElementById('create-btn');
  const logoutBtn = document.getElementById('logout-btn');

  //Tab switching logic
  tabJoin.addEventListener('click', () => {
    tabCreate.classList.remove('active');
    tabJoin.classList.add('active');
    createFormContainer.classList.remove('active');
    joinFormContainer.classList.add('active');
    clearJoinError();
  });

  tabCreate.addEventListener('click', () => {
    tabJoin.classList.remove('active');
    tabCreate.classList.add('active');
    joinFormContainer.classList.remove('active');
    createFormContainer.classList.add('active');
    clearJoinError();
  });

  function clearJoinError() {
    const existing = document.getElementById('join-error');
    if (existing) {
      existing.remove();
    }
  }

  socket.on('connect', () => {
    if (currentRoomCode && chatScreen.style.display !== 'none') {
      socket.emit('join-room', {
        roomCode: currentRoomCode,
        loadHistory: false,
      });
    }
  });

  function joinRoom(roomCode, loadHistory = true) {
    currentRoomCode = roomCode;

    setButtonLoading(joinBtn, true, 'Join room');

    socket.emit('join-room', {
      roomCode,
      loadHistory,
    });

    if (loadHistory) {
      loadingSpinner.style.display = 'flex';
    }
  }

  function showChatUI(roomCode) {
    //Expand container and show chat room
    document.querySelector('.container').classList.add('chat-active');
    joinScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    roomLabel.textContent = `Room: ${roomCode}`;
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

  //CREATE Room
  createBtn.addEventListener('click', () => {
    const roomCode = createRoomInput.value.trim();
    const duration = roomDuration.value;

    if (!roomCode) return showJoinError('Please enter a room code');

    if (roomCode.length < 4 || roomCode.length > 20) {
      return showJoinError('Room code must be between 4 to 20 characters');
    }

    setButtonLoading(createBtn, true, 'Create room');
    socket.emit('create-room', { roomCode, durationDays: duration });
  });

  createRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const roomCode = createRoomInput.value.trim();
      const duration = roomDuration.value;

      if (!roomCode) return showJoinError('Please enter a room code');

      if (roomCode.length < 4 || roomCode.length > 20) {
        return showJoinError('Room code must be between 4 to 20 characters');
      }

      setButtonLoading(createBtn, true, 'Create room');
      socket.emit('create-room', { roomCode, durationDays: duration });
    }
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
    setButtonLoading(leaveBtn, true, 'Leave room');

    //telling server that a person is leaving
    socket.emit('leave-room');

    currentRoomCode = null;

    //clearing typing state when leaving the room
    clearTimeout(typingTimeout);
    isTyping = false;
    typingUsers.clear();
    updateTypingIndicator();

    setButtonLoading(leaveBtn, false, 'Leave room');

    //resetting UI back to join screen
    document.querySelector('.container').classList.remove('chat-active');
    joinScreen.style.display = 'block';
    chatScreen.style.display = 'none';
    messagesDiv.innerHTML = '';
    roomInput.value = '';
    createRoomInput.value = '';

    //clear user list sidebar
    const usersList = document.getElementById('users-list');
    if (usersList) usersList.innerHTML = '';

    // Clear any previous validation errors
    const existing = document.getElementById('join-error');

    if (existing) existing.remove();
  });

  //LOG OUT
  logoutBtn.addEventListener('click', async () => {
    setButtonLoading(logoutBtn, true, 'Logout');
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
    setButtonLoading(logoutBtn, false, 'Logout');
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

  //room created
  socket.on('room-created', ({ roomCode }) => {
    //reset create button loading state
    setButtonLoading(createBtn, false, 'Create room');

    joinRoom(roomCode);
    createRoomInput.value = '';
  });

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
  socket.on('user-joined', ({ message, users, username }) => {
    if (username === myUsername) {
      showChatUI(currentRoomCode);
      loadingSpinner.style.display = 'none';

      //reset button when joined
      setButtonLoading(joinBtn, false, 'Join room');
      setButtonLoading(createBtn, false, 'Create room');
    } else {
      addSystemMessage(message);
    }
    updatePeopleCount(users.length);
    updateOnlineUsers(users);
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
    updateOnlineUsers(users);
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
    if (chatScreen.style.display === 'flex') {
      showChatError(message);
    } else {
      showJoinError(message);
      loadingSpinner.style.display = 'none'; //dismiss loading spinner

      //reset buttons to active states
      setButtonLoading(joinBtn, false, 'Join room');
      setButtonLoading(createBtn, false, 'Create room');
    }
  });

  // HELPER FUNCTIONS

  function setButtonLoading(button, isLoading, originalText) {
    if (isLoading) {
      button.disabled = true;
      button.textContent = 'Please wait...';
    } else {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

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
      indicator.style.display = 'block';
    }
  }

  function updateOnlineUsers(users) {
    const usersList = document.getElementById('users-list');
    if (!usersList) return;

    usersList.innerHTML = '';

    users.forEach((user) => {
      const li = document.createElement('li');
      li.className = 'user-item';

      const dot = document.createElement('span');
      dot.className = 'status-dot';

      if (user.userId === myUserId) {
        dot.classList.add('self');
      }

      const name = document.createElement('span');
      name.textContent =
        user.username + (user.userId === myUserId ? ' (You)' : '');

      li.appendChild(dot);
      li.appendChild(name);
      usersList.appendChild(li);
    });
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

    if (createFormContainer.classList.contains('active')) {
      createBtn.insertAdjacentElement('beforebegin', div);
    } else {
      joinBtn.insertAdjacentElement('beforebegin', div);
    }
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
