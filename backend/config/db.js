const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully!');
  } catch (error) {
    console.error('MongoDB connection failed: ', error.message);
    process.exit(1); //Stoping the server if mongodb didnt connect
  }
};

module.exports = connectDB;
