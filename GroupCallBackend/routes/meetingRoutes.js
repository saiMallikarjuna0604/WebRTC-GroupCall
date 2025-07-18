const express = require('express');
const Meeting = require('../models/Meeting');
const ParticipantActivity = require('../models/ParticipantActivity');
const { createWorker, createRouter, createWebRtcTransport } = require('../config/mediasoup');
const router = express.Router();

// MediaSoup global variables
let mediaSoupWorker = null;
const mediaSoupRooms = new Map(); // meetingId -> room

// Initialize MediaSoup worker
async function initializeMediaSoup() {
  if (!mediaSoupWorker) {
    mediaSoupWorker = await createWorker();
  }
}

// MediaSoup operations (real implementations)
async function createMediaSoupRoom(meetingId) {
  if (!mediaSoupWorker) {
    await initializeMediaSoup();
  }
  
  if (mediaSoupRooms.has(meetingId)) {
    return mediaSoupRooms.get(meetingId);
  }

  const router = await createRouter(mediaSoupWorker);
  const room = {
    meetingId,
    router,
    participants: new Map(), // email -> participant
    transports: new Map(), // transportId -> transport
    producers: new Map(), // producerId -> producer
    consumers: new Map() // consumerId -> consumer
  };

  mediaSoupRooms.set(meetingId, room);
  return room;
}

async function destroyMediaSoupRoom(meetingId) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) {
    return;
  }

  // Close all participants
  for (const [email, participant] of room.participants) {
    await removeParticipantFromRoom(meetingId, email);
  }

  // Close router
  await room.router.close();
  mediaSoupRooms.delete(meetingId);
}

async function addParticipantToRoom(meetingId, email, connections) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) {
    throw new Error('Room not found: ' + meetingId);
  }

  const socket = connections.get(email);
  
  // Check if participant already exists
  let participant = room.participants.get(email);
  if (participant) {
    // Update only the socket if participant exists
    participant.socket = socket;
  } else {
    // Create new participant if doesn't exist
    participant = {
      email,
      socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map()
    };
    room.participants.set(email, participant);
  }

  return participant;
}

async function removeParticipantFromRoom(meetingId, email) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) {
    return;
  }

  const participant = room.participants.get(email);
  if (!participant) {
    return;
  }

  // Close all transports
  participant.transports.forEach(transport => {
    transport.close();
    room.transports.delete(transport.id);
  });

  // Close all producers
  participant.producers.forEach(producer => {
    producer.close();
    room.producers.delete(producer.id);
  });

  // Close all consumers
  participant.consumers.forEach(consumer => {
    consumer.close();
    room.consumers.delete(consumer.id);
  });

  // Remove participant
  room.participants.delete(email);
}

// MediaSoup utility functions
async function createTransport(meetingId, email, direction) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) throw new Error('Room not found: ' + meetingId);

  const participant = room.participants.get(email);
  if (!participant) throw new Error('Participant not found: ' + email);

  const transport = await createWebRtcTransport(room.router);
  
  room.transports.set(transport.id, transport);
  participant.transports.set(direction, transport);

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters
  };
}

async function connectTransport(meetingId, transportId, dtlsParameters) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) throw new Error('Room not found: ' + meetingId);

  const transport = room.transports.get(transportId);
  if (!transport) throw new Error('Transport not found: ' + transportId);

  await transport.connect({ dtlsParameters });
}

async function createProducer(meetingId, email, transportId, kind, rtpParameters) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) throw new Error('Room not found: ' + meetingId);

  const transport = room.transports.get(transportId);
  if (!transport) throw new Error('Transport not found: ' + transportId);

  const producer = await transport.produce({ kind, rtpParameters });

  room.producers.set(producer.id, producer);
  const participant = room.participants.get(email);
  participant.producers.set(kind, producer);

  // Notify other participants
  room.participants.forEach((otherParticipant, otherEmail) => {
    if (otherEmail !== email) {
      otherParticipant.socket.emit('producer:created', {
        producerId: producer.id,
        kind,
        email,
        rtpParameters: producer.rtpParameters
      });
    }
  });

  return { producerId: producer.id, kind, email, rtpParameters: producer.rtpParameters};
}

async function createConsumer(meetingId, email, transportId, producerId, rtpCapabilities) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) throw new Error('Room not found: ' + meetingId);

  const transport = room.transports.get(transportId);
  if (!transport) throw new Error('Transport not found: ' + transportId);

  const producer = room.producers.get(producerId);
  if (!producer) throw new Error('Producer not found: ' + producerId);

  if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities })) {
    throw new Error('Cannot consume producer');
  }

  const consumer = await transport.consume({
    producerId: producer.id,
    rtpCapabilities,
    paused: false
  });

  room.consumers.set(consumer.id, consumer);
  const participant = room.participants.get(email);
  participant.consumers.set(producerId, consumer);

  

  // Add code to find producer's email
  let producerEmail = null;
  for (const [email, participant] of room.participants) {
      if (participant.producers.has(consumer.kind)) {
          const participantProducer = participant.producers.get(consumer.kind);
          if (participantProducer && participantProducer.id === producerId) {
              producerEmail = email;
              break;
          }
      }
  }
  
  return {
    consumerId: consumer.id,
    producerId: producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
    email: producerEmail  // Correct: This will be producer's email
  };
}

function getRouterRtpCapabilities(meetingId) {
  const room = mediaSoupRooms.get(meetingId);
  if (!room) throw new Error('Room not found: ' + meetingId);
  return room.router.rtpCapabilities;
}

// Analytics operations (in same file)
async function saveMeetingAnalytics(meetingData) {
  // TODO: Implement meeting analytics saving
}

async function saveParticipantJoin(meetingId, email, isHost = false) {
  try {
    await ParticipantActivity.create({
      meetingId,
      email,
      joinTime: new Date(),
      isHost
    });
  } catch (error) {
    // console.error('Error saving participant join:', error);
  }
}

async function saveParticipantLeave(meetingId, email) {
  try {
    const activity = await ParticipantActivity.findOne({ meetingId, email });
    if (activity) {
      activity.leaveTime = new Date();
      activity.totalDuration = Math.floor((activity.leaveTime - activity.joinTime) / 1000);
      await activity.save();
    }
  } catch (error) {
    // console.error('Error saving participant leave:', error);
  }
}

// Create a new meeting
router.post('/create', async (req, res) => {
  try {
    const { hostEmail, participants, title, description } = req.body;
    
    // Validate required fields
    if (!hostEmail) {
      return res.status(400).json({ error: 'hostEmail is required' });
    }
    
    if (!participants) {
      return res.status(400).json({ error: 'participants array is required' });
    }
    
    if (!Array.isArray(participants)) {
      return res.status(400).json({ error: 'participants must be an array' });
    }
    
    if (participants.length === 0) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }
    
    // Validate that all participants are valid email strings
    for (const participant of participants) {
      if (typeof participant !== 'string' || !participant.includes('@')) {
        return res.status(400).json({ error: 'All participants must be valid email addresses' });
      }
    }

    // Generate unique meeting ID
    const meetingId = `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create MediaSoup room
    const roomResult = await createMediaSoupRoom(meetingId);
    
    // Create meeting record
    const meeting = await Meeting.create({
      meetingId,
      hostEmail,
      participants: participants.map(email => ({ email })),
      title: title || 'Group Call',
      description: description || ''
    });

    // Add host to MediaSoup room so they can create transports
    await addParticipantToRoom(meetingId, hostEmail, req.app.locals.connections);

    // Save analytics
    await saveMeetingAnalytics(meeting);

    res.json({ meeting, success: true });
  } catch (error) {
    // console.error('Error creating meeting:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// Get meeting details
router.get('/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ meeting });
  } catch (error) {
    // console.error('Error fetching meeting:', error);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// Unified meeting action endpoint
// POST /api/meetings/:meetingId/action
// Body: { type: 'end', hostEmail: 'bob@example.com' }
// Body: { type: 'join', participantEmail: 'alice@example.com' }
// Body: { type: 'leave', participantEmail: 'alice@example.com' }
router.post('/:meetingId/action', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { type, hostEmail, participantEmail } = req.body;
    
    const meeting = await Meeting.findOne({ meetingId });
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    switch (type) {
      case 'end':
        return await handleEndMeeting(meeting, hostEmail, res);
      case 'join':
        return await handleJoinMeeting(meeting, participantEmail, res, req.app.locals.connections);
      case 'leave':
        return await handleLeaveMeeting(meeting, participantEmail, res);
      default:
        return res.status(400).json({ error: 'Invalid action type. Use: end, join, or leave' });
    }
  } catch (error) {
    // console.error('Error in meeting action:', error);
    res.status(500).json({ error: 'Failed to perform meeting action' });
  }
});

// Helper functions for meeting actions
async function handleEndMeeting(meeting, hostEmail, res) {
  if (meeting.hostEmail !== hostEmail) {
    return res.status(403).json({ error: 'Only host can end meeting' });
  }

  // Update meeting status
  meeting.status = 'completed';
  meeting.endTime = new Date();
  await meeting.save();

  // Destroy MediaSoup room
  await destroyMediaSoupRoom(meeting.meetingId);

  res.json({ message: 'Meeting ended successfully' });
}

async function handleJoinMeeting(meeting, participantEmail, res, connections) {
  if (meeting.status === 'completed') {
    return res.status(400).json({ error: 'Meeting has ended' });
  }

  // Check if participant is already in meeting
  const existingParticipant = meeting.participants.find(p => p.email === participantEmail);
  if (!existingParticipant) {
    meeting.participants.push({ email: participantEmail });
    await meeting.save();
  }

  // Add participant to MediaSoup room
 const resp= await addParticipantToRoom(meeting.meetingId, participantEmail, connections);
 console.log(resp,'------resp');
  // Get the MediaSoup room
  const room = mediaSoupRooms.get(meeting.meetingId);
  if (room) {
    const newParticipant = room.participants.get(participantEmail);
    
    if (newParticipant && newParticipant.socket) {
      newParticipant.socket.on('client:ready', () => {
        // Iterate over participants first
        for (const [email, participant] of room.participants) {
          console.log(participant,'------participant');
          // Skip the new participant
          if (email !== participantEmail) {
            // Get all producers from this participant
            participant.producers.forEach((producer, producerId) => {
              newParticipant.socket.emit('producer:created', {
                producerId: producer.id,
                kind: producer.kind,
                email: email,
                rtpParameters: producer.rtpParameters
              });
            });
          }
        }
      });
    }
  }

  // Save analytics
  const isHost = meeting.hostEmail === participantEmail;
  await saveParticipantJoin(meeting.meetingId, participantEmail, isHost);

  res.json({ message: 'Joined meeting successfully' });
}

async function handleLeaveMeeting(meeting, participantEmail, res) {
  // Remove participant from meeting
  meeting.participants = meeting.participants.filter(p => p.email !== participantEmail);
  await meeting.save();

  // Remove participant from MediaSoup room
  await removeParticipantFromRoom(meeting.meetingId, participantEmail);

  // Save analytics
  await saveParticipantLeave(meeting.meetingId, participantEmail);

  res.json({ message: 'Left meeting successfully' });
}

// Get user's meetings
router.get('/user/:userEmail', async (req, res) => {
  try {
    const { userEmail } = req.params;
    const { status } = req.query;
    
    let query = {
      $or: [
        { hostEmail: userEmail },
        { 'participants.email': userEmail }
      ]
    };
    
    if (status) {
      query.status = status;
    }
    
    const meetings = await Meeting.find(query).sort({ startTime: -1 });
    res.json({ meetings });
  } catch (error) {
    // console.error('Error fetching user meetings:', error);
    res.status(500).json({ error: 'Failed to fetch user meetings' });
  }
});

module.exports = {
  router,
  createMediaSoupRoom,
  destroyMediaSoupRoom,
  addParticipantToRoom,
  removeParticipantFromRoom,
  createTransport,
  connectTransport,
  createProducer,
  createConsumer,
  getRouterRtpCapabilities,
  mediaSoupRooms
}; 