const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri = "mongodb+srv://mallikarjunasai174:kcG172JQcgRHGbXR@myprojects.rse9hc8.mongodb.net/webrtc_app";
    
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB; 