const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: String,
    required: true
  },
  members: [{
    email: String,
    status: {
      type: String,
      enum: ['pending', 'accepted'],
      default: 'pending'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Group', GroupSchema); 