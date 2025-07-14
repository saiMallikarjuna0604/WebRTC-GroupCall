const mongoose = require('mongoose');

const ParticipantActivitySchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  joinTime: {
    type: Date,
    required: true
  },
  leaveTime: {
    type: Date,
    default: null
  },
  totalDuration: {
    type: Number,
    default: 0 // Total time in seconds
  },
  isHost: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
ParticipantActivitySchema.index({ meetingId: 1, email: 1 });
ParticipantActivitySchema.index({ email: 1 });
ParticipantActivitySchema.index({ meetingId: 1 });

module.exports = mongoose.model('ParticipantActivity', ParticipantActivitySchema); 