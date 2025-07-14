const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Import database connection
const connectDB = require('./config/database');

// Import routes
const userRoutes = require('./routes/userRoutes');
const groupRoutes = require('./routes/groupRoutes');
const meetingRoutes = require('./routes/meetingRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

// Import MediaSoup functions from meetingRoutes
const {
  createTransport,
  connectTransport,
  createProducer,
  createConsumer,
  getRouterRtpCapabilities
} = meetingRoutes;

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Connect to MongoDB
connectDB();

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Store socket connections in app.locals for route access
app.locals.connections = new Map();

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/meetings', meetingRoutes.router);
app.use('/api/analytics', analyticsRoutes);

// Socket.IO connection handling
io.on('connection', async (socket) => {
    console.log('New client connected');
    let userEmail = null;

    socket.on('register', async (data) => {
        try {
            userEmail = data.email;
            app.locals.connections.set(userEmail, socket);
            
            // Update user status (existing logic)
            const User = require('./models/User');
            await User.findOneAndUpdate(
                { email: userEmail },
                { status: 'online', lastActive: new Date() }
            );
            
            // Broadcast to others with complete user data
            socket.broadcast.emit('user:status', {
                email: userEmail,
                status: 'online'
            });
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    // Handle group creation notifications (existing)
    // socket.on('group:invite', (data) => {
    //     // This will be handled by the group routes
    // });

    // socket.on('group:member-accepted', (data) => {
    //     // This will be handled by the group routes
    // });

    // socket.on('group:member-declined', (data) => {
    //     // This will be handled by the group routes
    // });

    // socket.on('group:member-removed', (data) => {
    //     // This will be handled by the group routes
    // });

    // socket.on('group:member-exited', (data) => {
    //     // This will be handled by the group routes
    // });

    // socket.on('group:deleted', (data) => {
    //     // This will be handled by the group routes
    // });

    // Call management events
    socket.on('call:initiate', async (data) => {
        console.log('Call initiation received:', data);
        await handleCallInitiate(socket, data);
    });

    socket.on('call:accept', async (data) => {
        console.log('Call acceptance received:', data);
        await handleCallAccept(socket, data);
    });

    socket.on('call:decline', async (data) => {
        console.log('Call decline received:', data);
        await handleCallDecline(socket, data);
    });

    socket.on('call:join', async (data) => {
        console.log('Call join received:', data);
        await handleCallJoin(socket, data);
    });

    socket.on('call:leave', async (data) => {
        console.log('Call leave received:', data);
        await handleCallLeave(socket, data);
    });

    socket.on('call:end', async (data) => {
        console.log('Call end received:', data);
        await handleCallEnd(socket, data);
    });

    socket.on('call:rejoin', async (data) => {
        console.log('Call rejoin received:', data);
        await handleCallRejoin(socket, data);
    });

    // MediaSoup events
    socket.on('transport:create', async (data) => {
        try {
            console.log('Transport create received:', data);
            const { meetingId, direction, email } = data;
            const transportInfo = await createTransport(meetingId, email, direction);
            socket.emit('transport:created', transportInfo);
        } catch (error) {
            console.error('Transport create error:', error);
            socket.emit('error', { message: 'Failed to create transport' });
        }
    });

    socket.on('transport:connect', async (data) => {
        try {
            console.log('Transport connect received:', data);
            const { meetingId, transportId, dtlsParameters } = data;
            await connectTransport(meetingId, transportId, dtlsParameters);
            socket.emit('transport:connected', { transportId });
        } catch (error) {
            console.error('Transport connect error:', error);
            socket.emit('error', { message: 'Failed to connect transport' });
        }
    });

    socket.on('producer:create', async (data) => {
        try {
            console.log('Producer create received:', data);
            const { meetingId, email, transportId, kind, rtpParameters } = data;
            const result = await createProducer(meetingId, email, transportId, kind, rtpParameters);
            socket.emit('producer:created', result);
        } catch (error) {
            console.error('Producer create error:', error);
            socket.emit('error', { message: 'Failed to create producer' });
        }
    });

    socket.on('consumer:create', async (data) => {
        try {
            console.log('Consumer create received:', data);
            const { meetingId, email, transportId, producerId, rtpCapabilities } = data;
            const result = await createConsumer(meetingId, email, transportId, producerId, rtpCapabilities);
            socket.emit('consumer:created', result);
        } catch (error) {
            console.error('Consumer create error:', error);
            socket.emit('error', { message: 'Failed to create consumer' });
        }
    });

    socket.on('router:rtpCapabilities', async (data) => {
        try {
            console.log('Router RTP capabilities requested:', data);
            const { meetingId } = data;
            const rtpCapabilities = getRouterRtpCapabilities(meetingId);
            socket.emit('router:rtpCapabilities', { rtpCapabilities });
        } catch (error) {
            console.error('RTP capabilities error:', error);
            socket.emit('error', { message: 'Failed to get RTP capabilities' });
        }
    });

    socket.on('disconnect', async () => {
        if (userEmail) {
            app.locals.connections.delete(userEmail);
            
            // Clean up MediaSoup resources
            try {
                const { removeParticipantFromRoom, mediaSoupRooms } = require('./routes/meetingRoutes');
                // Remove user from all MediaSoup rooms they might be in
                // This will clean up transports, producers, and consumers
                for (const [meetingId, room] of mediaSoupRooms) {
                    if (room.participants.has(userEmail)) {
                        await removeParticipantFromRoom(meetingId, userEmail);
                        console.log('Cleaned up MediaSoup resources for:', userEmail, 'in room:', meetingId);
                    }
                }
            } catch (error) {
                console.error('Error cleaning up MediaSoup resources:', error);
            }
            
            // Update user status (existing logic)
            const User = require('./models/User');
            await User.findOneAndUpdate(
                { email: userEmail },
                { status: 'offline', lastActive: new Date() }
            );

            // Broadcast to others with complete user data
            socket.broadcast.emit('user:status', {
                email: userEmail,
                status: 'offline'
            });
        }
        console.log('Client disconnected');
    });
});

// Call management handlers (simple implementations)
async function handleCallInitiate(socket, data) {
    try {
        console.log('Handling call initiation:', data);
        const { hostEmail, participants, title } = data;
        
        // Create meeting via API call
        const response = await fetch('http://localhost:3001/api/meetings/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hostEmail, participants, title })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Meeting created:', result);
            
            // Send invitations to participants
            participants.forEach(email => {
                const participantSocket = app.locals.connections.get(email);
                if (participantSocket) {
                    participantSocket.emit('call:invite', { 
                        meetingId: result.meeting.meetingId, 
                        host: hostEmail,
                        title: title || 'Group Call'
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error handling call initiation:', error);
    }
}

async function handleCallAccept(socket, data) {
    try {
        console.log('Handling call acceptance:', data);
        const { meetingId, email } = data;
        
        // Join meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'join', participantEmail: email })
        });
        
        if (response.ok) {
            // Notify other participants
            socket.broadcast.emit('participant:joined', { meetingId, email });
        }
    } catch (error) {
        console.error('Error handling call acceptance:', error);
    }
}

async function handleCallDecline(socket, data) {
    try {
        console.log('Handling call decline:', data);
        const { meetingId, email, hostEmail } = data;
        
        // Notify host about decline
        const hostSocket = app.locals.connections.get(hostEmail);
        if (hostSocket) {
            hostSocket.emit('call:declined', { meetingId, email });
        }
    } catch (error) {
        console.error('Error handling call decline:', error);
    }
}

async function handleCallJoin(socket, data) {
    try {
        console.log('Handling call join:', data);
        const { meetingId, email } = data;
        
        // Notify other participants
        socket.broadcast.emit('participant:joined', { meetingId, email });
    } catch (error) {
        console.error('Error handling call join:', error);
    }
}

async function handleCallLeave(socket, data) {
    try {
        console.log('Handling call leave:', data);
        const { meetingId, email } = data;
        
        // Leave meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'leave', participantEmail: email })
        });
        
        if (response.ok) {
            // Notify other participants
            socket.broadcast.emit('participant:left', { meetingId, email });
        }
    } catch (error) {
        console.error('Error handling call leave:', error);
    }
}

async function handleCallEnd(socket, data) {
    try {
        console.log('Handling call end:', data);
        const { meetingId, hostEmail } = data;
        
        // End meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'end', hostEmail })
        });
        
        if (response.ok) {
            // Notify all participants
            socket.broadcast.emit('call:ended', { meetingId });
        }
    } catch (error) {
        console.error('Error handling call end:', error);
    }
}

async function handleCallRejoin(socket, data) {
    try {
        console.log('Handling call rejoin:', data);
        const { meetingId, email } = data;
        
        // Rejoin meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'join', participantEmail: email })
        });
        
        if (response.ok) {
            // Notify other participants
            socket.broadcast.emit('participant:rejoined', { meetingId, email });
        }
    } catch (error) {
        console.error('Error handling call rejoin:', error);
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Routes initialized:');
    console.log('- User Routes');
    console.log('- Group Routes');
    console.log('- Meeting Routes');
    console.log('- Analytics Routes');
    console.log('Socket.IO events ready for call management');
    console.log('MediaSoup integration complete');
}); 