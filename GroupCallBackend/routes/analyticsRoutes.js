const express = require('express');
const Meeting = require('../models/Meeting');
const ParticipantActivity = require('../models/ParticipantActivity');
const router = express.Router();

// Unified analytics endpoint
// GET /api/analytics?type=host&email=bob@example.com
// GET /api/analytics?type=meeting&meetingId=123
// GET /api/analytics?type=participant&email=alice@example.com
router.get('/', async (req, res) => {
  const { type, email, meetingId } = req.query;
  
  try {
    console.log('Analytics: Getting analytics', { type, email, meetingId });
    
    switch (type) {
      case 'host':
        return await getHostAnalytics(email, res);
      case 'meeting':
        return await getMeetingAnalytics(meetingId, res);
      case 'participant':
        return await getParticipantAnalytics(email, res);
      default:
        return res.status(400).json({ error: 'Invalid analytics type. Use: host, meeting, or participant' });
    }
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Helper functions in same file
async function getHostAnalytics(email, res) {
  console.log('Getting host analytics for:', email);
  
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    
    let query = { hostEmail: email };
    if (status) {
      query.status = status;
    }
    
    const meetings = await Meeting.find(query)
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    
    const totalCount = await Meeting.countDocuments(query);
    
    // Calculate summary statistics
    const totalMeetings = totalCount;
    const activeMeetings = await Meeting.countDocuments({ hostEmail: email, status: 'active' });
    const completedMeetings = await Meeting.countDocuments({ hostEmail: email, status: 'completed' });
    
    // Calculate total duration
    const completedMeetingsData = await Meeting.find({ hostEmail: email, status: 'completed' });
    const totalDuration = completedMeetingsData.reduce((sum, meeting) => {
      if (meeting.endTime) {
        return sum + Math.floor((meeting.endTime - meeting.startTime) / 1000);
      }
      return sum;
    }, 0);
    
    const averageDuration = completedMeetings > 0 ? Math.floor(totalDuration / completedMeetings) : 0;
    
    res.json({ 
      type: 'host',
      email,
      meetings, 
      totalCount,
      hasMore: totalCount > parseInt(offset) + meetings.length,
      summary: {
        totalMeetings,
        activeMeetings,
        completedMeetings,
        totalDuration,
        averageDuration
      }
    });
  } catch (error) {
    console.error('Error fetching host analytics:', error);
    res.status(500).json({ error: 'Failed to fetch host analytics' });
  }
}

async function getMeetingAnalytics(meetingId, res) {
  console.log('Getting meeting analytics for:', meetingId);
  
  try {
    // Get meeting details
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    
    // Get participant activities
    const participantActivities = await ParticipantActivity.find({ meetingId })
      .sort({ joinTime: 1 });
    
    // Calculate analytics
    const totalParticipants = meeting.participants.length;
    const totalDuration = meeting.endTime 
      ? Math.floor((meeting.endTime - meeting.startTime) / 1000)
      : Math.floor((new Date() - meeting.startTime) / 1000);
    
    const participantDetails = participantActivities.map(activity => ({
      email: activity.email,
      joinTime: activity.joinTime,
      leaveTime: activity.leaveTime,
      totalDuration: activity.totalDuration,
      isHost: activity.isHost
    }));
    
    res.json({
      type: 'meeting',
      meetingId,
      meeting,
      analytics: {
        totalParticipants,
        totalDuration,
        participantDetails
      }
    });
  } catch (error) {
    console.error('Error fetching meeting analytics:', error);
    res.status(500).json({ error: 'Failed to fetch meeting analytics' });
  }
}

async function getParticipantAnalytics(email, res) {
  console.log('Getting participant analytics for:', email);
  
  try {
    const { limit = 20, offset = 0 } = req.query;
    
    // Get meetings where user participated
    const meetings = await Meeting.find({
      $or: [
        { hostEmail: email },
        { 'participants.email': email }
      ]
    })
    .sort({ startTime: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset));
    
    // Get participant activities
    const activities = await ParticipantActivity.find({ email })
      .sort({ joinTime: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    
    // Calculate summary statistics
    const totalMeetings = await Meeting.countDocuments({
      $or: [
        { hostEmail: email },
        { 'participants.email': email }
      ]
    });
    
    const totalDuration = activities.reduce((sum, activity) => sum + activity.totalDuration, 0);
    const hostedMeetings = await Meeting.countDocuments({ hostEmail: email });
    const joinedMeetings = totalMeetings - hostedMeetings;
    
    res.json({
      type: 'participant',
      email,
      meetings,
      activities,
      summary: {
        totalMeetings,
        hostedMeetings,
        joinedMeetings,
        totalDuration,
        averageDuration: totalMeetings > 0 ? Math.floor(totalDuration / totalMeetings) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching participant analytics:', error);
    res.status(500).json({ error: 'Failed to fetch participant analytics' });
  }
}

module.exports = router; 