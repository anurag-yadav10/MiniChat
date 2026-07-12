const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { StatusCodes } = require('http-status-codes');
const authMiddleware = require('../middleware/authMiddleware');

function createAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      username: user.username,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );
}

async function createRefreshToken(userId) {
  const token = crypto.randomBytes(64).toString('hex');

  await RefreshToken.create({
    token,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return token;
}

function sendRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

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

    //creating access and refresh tokens
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user._id);

    sendRefreshCookie(res, refreshToken);

    res.status(StatusCodes.CREATED).json({
      token: accessToken,
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

    //access token and refresh token
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user._id);

    sendRefreshCookie(res, refreshToken);

    res.status(StatusCodes.OK).json({
      token: accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Server error' });
  }
});

//protected routes:
router.get('/profile', authMiddleware, (req, res) => {
  //req.user has {userId,username}
  res.json({ message: `Hello ${req.user.username}` });
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: 'No refresh token' });
  }

  try {
    const storedToken = await RefreshToken.findOne({ token: refreshToken });

    if (!storedToken) {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'Invalid refresh token' });
    }

    if (storedToken.expiresAt < new Date()) {
      await RefreshToken.deleteOne({ token: refreshToken });

      res.clearCookie('refreshToken', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      });

      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'Refresh token expired' });
    }

    const user = await User.findById(storedToken.userId);

    if (!user) {
      await RefreshToken.deleteOne({ token: refreshToken });

      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'User no longer exists' });
    }

    const accessToken = createAccessToken(user);

    res.json({ token: accessToken });
  } catch (error) {
    console.error('Refresh error:', error.message);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Server error' });
  }
});

router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (refreshToken) {
    await RefreshToken.deleteOne({ token: refreshToken });
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
