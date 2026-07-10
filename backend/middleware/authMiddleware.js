const jwt = require('jsonwebtoken');
const { StatusCodes } = require('http-status-codes');

const authMiddleware = (req, res, next) => {
  //grabing token
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: 'No token, access denied' });
  }

  //extracting token
  const token = authHeader.split(' ')[1];

  //verfying it
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .json({ message: 'Token expired' });
    }

    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ message: 'Token is invalid' });
  }
};

module.exports = authMiddleware;
