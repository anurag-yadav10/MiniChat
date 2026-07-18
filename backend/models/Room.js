const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: [true, 'Room code is required'],
      unique: true,
      trim: true,
      lowercase: true, //converts all codes to lowercase and avoids case sensitivity issue
      minLength: [4, 'Room code must be atleast 4 characters long'],
      maxLength: [20, 'Room code can not exeed 20 characters'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Room', roomSchema);
