const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true
  },
  hostEmail: {
    type: String,
    required: true
  },
  participants: [{
    email: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: null
  },
  title: {
    type: String,
    default: 'Group Call'
  },
  description: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for efficient queries
MeetingSchema.index({ hostEmail: 1, status: 1 });
MeetingSchema.index({ 'participants.email': 1 });
MeetingSchema.index({ meetingId: 1 });

module.exports = mongoose.model('Meeting', MeetingSchema); 