const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { StatusCodes } = require('http-status-codes');
const authMiddleware = require('../middleware/authMiddleware');

// REGISTER

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  //checking if all fields are present
  if (!username || !email || !password) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'All fields are required.' });
  }

  //Password strength check
  if (password.length < 8) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'Password must be atleast 8 characters long.' });
  }

  if (!/[A-Z]/.test(password)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Password must contain at least one uppercase letter.',
    });
  }

  if (!/[a-z]/.test(password)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: 'Password must contain at least one lowercase letter.',
    });
  }

  if (!/[0-9]/.test(password)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'Password must contain at least one number.' });
  }

  try {
    //checking if email or username already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Username or email already taken.' });
    }

    //hashing the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    //saving the user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
    });

    //creating and sending jwt
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    res.status(StatusCodes.CREATED).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Register error:', error.message);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Server error' });
  }
});

// LOGIN

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  //checking if the data is provided
  if (!email || !password) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ message: 'All fields are required.' });
  }

  try {
    //finding user by email (since it was unique)
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Invalid email or password.' });
    }

    //comparing password with hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Invalid email or password.' });
    }

    //creating and sending jwt
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' },
    );

    res.status(StatusCodes.CREATED).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
  }
});

//protected routes:
router.get('/profile', authMiddleware, (req, res) => {
  //req.user has {userId,username}
  res.json({ message: `Hello ${req.user.username}` });
});

module.exports = router;
