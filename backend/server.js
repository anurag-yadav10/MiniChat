require('dotenv').config();
const cookieParser = require('cookie-parser');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const Message = require('./models/Message');
const Room = require('./models/Room');
const authRoutes = require('./routes/auth');

//security
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

//Strict limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, //15 minute window
  max: 10, //max 10 attempts per IP
  message: { message: 'Too many attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

//general limiter for everything else
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many attempts, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();
app.use(helmet());
app.use(generalLimiter);

app.use(express.json());

//cookie
app.use(cookieParser());

// Frontend Static files
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api/v1/auth', authLimiter, authRoutes);

// IMPORTANT: Socket.io needs a raw http server, not just express
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*' },
});

//Connect to MongoDB
connectDB();

// Track how many people are in each room

const roomUsers = {};

//Socket.io JWT middleware

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }

    return next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`${socket.username} connected: ${socket.id}`);

  //user creates a room
  socket.on('create-room', async ({ roomCode, durationDays }) => {
    if (!roomCode) {
      socket.emit('error-message', 'Room code is required');
      return;
    }

    const cleanRoomCode = roomCode.trim().toLowerCase();

    if (cleanRoomCode.length < 4 || cleanRoomCode.length > 20) {
      socket.emit(
        'error-message',
        'Room code must be between 4 to 20 characters',
      );
      return;
    }

    const days = Number(durationDays);
    if (![1, 3].includes(days)) {
      socket.emit(
        'error-message',
        'Invalid room duuration, Choose 1 or 3 days.',
      );
      return;
    }

    try {
      //checking if the room code already exists
      const existingRoom = await Room.findOne({ roomCode: cleanRoomCode });
      if (existingRoom) {
        socket.emit(
          'error-message',
          'Room code already exists, try a new one.',
        );
        return;
      }

      //enforcing 5 active rooms per user
      const userRoomsCount = await Room.countDocuments({
        createdBy: socket.userId,
      });

      if (userRoomsCount >= 5) {
        socket.emit(
          'error-message',
          'You have reached the limit of creating 5 active rooms, please wait for them to expire.',
        );
        return;
      }

      //calculating exact expiration time in ms
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      //saving the room
      await Room.create({
        roomCode: cleanRoomCode,
        createdBy: socket.userId,
        expiresAt,
      });

      //reply the success of room creation
      socket.emit('room-created', { roomCode: cleanRoomCode });
    } catch (error) {
      console.error('Error creating room:', error.message);
      socket.emit('error-message', 'Server error while creating room');
    }
  });

  // User joins a room
  socket.on('join-room', async (payload) => {
    const rawRoomCode =
      typeof payload === 'string' ? payload : payload?.roomCode;
    const loadHistory =
      typeof payload === 'string' ? true : payload?.loadHistory !== false;

    if (!rawRoomCode) {
      socket.emit('error-message', 'Room code is required.');
      return;
    }

    const roomCode = rawRoomCode.trim().toLowerCase();

    if (roomCode.length < 4 || roomCode.length > 20) {
      socket.emit(
        'error-message',
        'Room code must be between 4 and 20 characters',
      );
      return;
    }

    try {
      //verify the room exists in database and isnt expired yet
      const room = await Room.findOne({ roomCode });
      if (!room) {
        socket.emit('error-message', 'Room does not exist or is expired.');
        return;
      }

      //Join the socket.io room
      socket.join(roomCode);
    } catch (error) {
      console.error('Error verifying room:', error.message);
      socket.emit('error-message', 'Server error in joining room');
      return;
    }

    // Storing user info on their socket:
    socket.roomCode = roomCode;

    if (!roomUsers[roomCode]) {
      roomUsers[roomCode] = [];
    }

    //adding user to room list (with avoiding duplicates)
    const alreadyInRoom = roomUsers[roomCode].find(
      (u) => u.userId === socket.userId,
    );

    if (!alreadyInRoom) {
      roomUsers[roomCode].push({
        userId: socket.userId,
        username: socket.username,
      });
    }

    //Loading past 30 messages for the user just joined, and showing it to them
    if (loadHistory) {
      try {
        const pastMessages = await Message.find({ roomCode })
          .sort({ time: 1 }) //from old to new messages sorting
          .limit(30);
        socket.emit('load-past-messages', pastMessages);
      } catch (error) {
        console.error('Error loading messages: ', error.message);
      }
    }

    //Tell everyone in room that someone joined
    io.to(roomCode).emit('user-joined', {
      message: `${socket.username} joined the room`,
      users: roomUsers[roomCode],
      username: socket.username,
    });

    console.log(`${socket.username} joined the room: ${roomCode}`);
  });

  // User sends a message
  socket.on('send-message', async ({ message }) => {
    //messages speed check, error if consecutive messages in less than 500 ms
    const now = Date.now();
    if (socket.lastMessage && now - socket.lastMessage < 500) {
      socket.emit(
        'error-message',
        'Slow down, you are sending messages too fast !',
      );
      return;
    }

    socket.lastMessage = now;

    //Length check
    if (!message || message.trim().length === 0) {
      socket.emit('error-message', 'message cannot be empty');
      return;
    }

    if (!socket.roomCode) {
      socket.emit(
        'error-message',
        'Please join a room before sending messages.',
      );
      return;
    }

    if (message.length > 1000) {
      socket.emit('error-message', 'Message is too long.');
      return;
    }

    const roomCode = socket.roomCode;
    const time = new Date();

    //Saving message to MongoDB
    try {
      await Message.create({
        roomCode,
        userId: socket.userId,
        username: socket.username,
        message,
        time,
      });

      //count total messages in the room
      const totalMessages = await Message.countDocuments({ roomCode }); //returns a number

      if (totalMessages > 30) {
        const excess = totalMessages - 30;

        //finding older excess messages and getting their ID
        const oldMessages = await Message.find({ roomCode })
          .sort({ time: 1 }) //oldest first
          .limit(excess)
          .select('_id'); //fetch only the ids

        const idsToDelete = oldMessages.map((msg) => msg._id);

        await Message.deleteMany({ _id: { $in: idsToDelete } });
      }
    } catch (error) {
      console.error('Error saving the message: ', error.message);
    }

    // Broadcast message to everyone else in the room.
    // The sender already renders their message immediately on the client.
    socket.to(roomCode).emit('receive-message', {
      userId: socket.userId,
      username: socket.username,
      message,
      time: new Date().toLocaleTimeString(),
    });
  });

  //User leaves room
  socket.on('leave-room', () => {
    handleLeave(socket);
  });

  socket.on('disconnect', () => {
    handleLeave(socket);
  });

  //listen for typing and broadcast to others in the room
  socket.on('typing', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    socket.to(roomCode).emit('user-typing', { username: socket.username });
  });

  //listen to stop typing and broadcast to others
  socket.on('stop-typing', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;

    socket.to(roomCode).emit('user-stop-typing', { username: socket.username });
  });
});

//Helper function to handle both leave and disconnect
function handleLeave(socket) {
  const { username, roomCode, userId } = socket;

  if (!roomCode || !roomUsers[roomCode]) return;

  socket.leave(roomCode);

  //removing the user from the list
  roomUsers[roomCode] = roomUsers[roomCode].filter((u) => u.userId !== userId);

  //telling everyone that the user left room
  io.to(roomCode).emit('user-left', {
    message: `${username} left the room`,
    users: roomUsers[roomCode],
  });

  socket.roomCode = null;

  console.log(`${username} left room:${roomCode}`);
}

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`server running on http://localhost:${PORT}`);
});
