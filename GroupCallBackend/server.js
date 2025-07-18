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

// Store pending calls for timeout handling
app.locals.pendingCalls = new Map(); // meetingId -> { hostEmail, participants, timeoutId, respondedParticipants }

// API Routes
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/meetings', meetingRoutes.router);
app.use('/api/analytics', analyticsRoutes);

// Socket.IO connection handling
io.on('connection', async (socket) => {
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
            socket.emit('error', { message: 'Failed to register' });
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
        await handleCallInitiate(socket, data);
    });

    socket.on('call:accept', async (data) => {
        await handleCallAccept(socket, data);
    });

    socket.on('call:decline', async (data) => {
        await handleCallDecline(socket, data);
    });

    socket.on('call:join', async (data) => {
        await handleCallJoin(socket, data);
    });

    socket.on('call:leave', async (data) => {
        await handleCallLeave(socket, data);
    });

    socket.on('call:end', async (data) => {
        await handleCallEnd(socket, data);
    });

    socket.on('call:cancel', async (data) => {
        await handleCallCancel(socket, data);
    });

    socket.on('call:rejoin', async (data) => {
        await handleCallRejoin(socket, data);
    });

    // MediaSoup events
    socket.on('transport:create', async (data) => {
        try {
            const { meetingId, direction, email } = data;
            const transportInfo = await createTransport(meetingId, email, direction);
            socket.emit('transport:created', transportInfo);
        } catch (error) {
            socket.emit('error', { message: 'Failed to create transport' });
        }
    });

    socket.on('transport:connect', async (data) => {
        try {
            const { meetingId, transportId, dtlsParameters } = data;
            await connectTransport(meetingId, transportId, dtlsParameters);
            socket.emit('transport:connected', { transportId });
        } catch (error) {
            socket.emit('error', { message: 'Failed to connect transport' });
        }
    });

    socket.on('producer:create', async (data) => {
        try {
            const { meetingId, email, transportId, kind, rtpParameters } = data;
            const result = await createProducer(meetingId, email, transportId, kind, rtpParameters);
            socket.emit('producer:created', result);
        } catch (error) {
            socket.emit('error', { message: 'Failed to create producer' });
        }
    });

    socket.on('consumer:create', async (data) => {
        try {
            const { meetingId, email, transportId, producerId, rtpCapabilities } = data;
            const result = await createConsumer(meetingId, email, transportId, producerId, rtpCapabilities);
            socket.emit('consumer:created', result);
        } catch (error) {
            socket.emit('error', { message: 'Failed to create consumer' });
        }
    });

    socket.on('router:rtpCapabilities', async (data) => {
        try {
            const { meetingId } = data;
            const rtpCapabilities = getRouterRtpCapabilities(meetingId);
            socket.emit('router:rtpCapabilities', { rtpCapabilities });
        } catch (error) {
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
                    }
                }
            } catch (error) {
                // Handle error silently
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
    });
});

// Call management handlers (simple implementations)
async function handleCallInitiate(socket, data) {
    try {
        const { hostEmail, participants, title, meetingId } = data;
        
        // Validate that the meeting exists and belongs to the host
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}`);
        if (!response.ok) {
            return;
        }
        
        const result = await response.json();
        const meeting = result.meeting;
        
        // Verify the host owns this meeting
        if (meeting.hostEmail !== hostEmail) {
            return;
        }
        
        // Set up timeout for call (40 seconds)
        const timeoutId = setTimeout(() => {
            handleCallTimeout(meetingId, hostEmail, participants);
        }, 40000);
        
        // Store pending call
        app.locals.pendingCalls.set(meetingId, {
            hostEmail,
            participants,
            timeoutId,
            respondedParticipants: new Set() // Track who has responded
        });
        
        // Send invitations to participants
        participants.forEach(email => {
            const participantSocket = app.locals.connections.get(email);
            if (participantSocket) {
                participantSocket.emit('call:invite', { 
                    meetingId: meetingId, 
                    host: hostEmail,
                    title: title || 'Group Call'
                });
            }
        });
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallTimeout(meetingId, hostEmail, participants) {
    try {
        
        // Get the pending call to check who has responded
        const pendingCall = app.locals.pendingCalls.get(meetingId);
        
        if (pendingCall) {
            // Only send timeout to participants who haven't responded
            const unrespondedParticipants = pendingCall.participants.filter(
                email => !pendingCall.respondedParticipants.has(email)
            );
            
            // Send timeout to host if they haven't cancelled (host is separate from participants)
            const hostSocket = app.locals.connections.get(hostEmail);
            if (hostSocket) {
                // Send status updates for unresponded participants
                unrespondedParticipants.forEach(email => {
                    hostSocket.emit('participant:status-update', { 
                        meetingId, 
                        email, 
                        status: 'timeout',
                        action: 'timeout'
                    });
                });
                
                // Send single timeout event to host
                hostSocket.emit('call:timeout', { 
                    meetingId, 
                    hostEmail,
                    participants: unrespondedParticipants 
                });
            }
            
            // Notify unresponded participants about timeout (use filtered array)
            unrespondedParticipants.forEach(email => {
                const participantSocket = app.locals.connections.get(email);
                if (participantSocket) {
                    participantSocket.emit('call:timeout', { meetingId, hostEmail });
                }
            });
            
            // Remove from pending calls AFTER processing
            app.locals.pendingCalls.delete(meetingId);
        }
        
        // End meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'end', hostEmail })
        });
        
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallAccept(socket, data) {
    try {
        const { meetingId, email } = data;
        
        // Get the pending call to track responses
        const pendingCall = app.locals.pendingCalls.get(meetingId);
        
        if (pendingCall) {
            // Track that this participant responded
            pendingCall.respondedParticipants.add(email);
            
            // Check if ALL participants have responded
            if (pendingCall.respondedParticipants.size === pendingCall.participants.length) {
                // All participants responded - clear timeout and remove from pending
                clearTimeout(pendingCall.timeoutId);
                app.locals.pendingCalls.delete(meetingId);
            } else {
                // Keep timeout active for remaining participants
            }
        }
        
        // Join meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'join', participantEmail: email })
        });
        
        if (response.ok) {
            // Notify host about participant acceptance
            const hostSocket = app.locals.connections.get(pendingCall.hostEmail);
            if (hostSocket) {
                hostSocket.emit('participant:status-update', { 
                    meetingId, 
                    email, 
                    status: 'answered',
                    action: 'accept'
                });
                
                // Notify host that someone accepted the call
                hostSocket.emit('call:accepted', { 
                    meetingId, 
                    email,
                    hostEmail: pendingCall.hostEmail
                });
            }
            
            // Notify other participants
            socket.broadcast.emit('participant:joined', { meetingId, email });
        }
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallDecline(socket, data) {
    try {
        const { meetingId, email, hostEmail } = data;
        
        // Track that this participant responded but keep call pending for others
        const pendingCall = app.locals.pendingCalls.get(meetingId);
        if (pendingCall) {
            // Track that this participant responded
            pendingCall.respondedParticipants.add(email);
            // DON'T clear timeout - let it continue for remaining participants
        }
        
        // Notify host about decline with detailed status
        const hostSocket = app.locals.connections.get(hostEmail);
        if (hostSocket) {
            hostSocket.emit('participant:status-update', { 
                meetingId, 
                email, 
                status: 'declined',
                action: 'decline'
            });
            
            // Also emit the legacy event for backward compatibility
            hostSocket.emit('call:declined', { meetingId, email });
        }
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallJoin(socket, data) {
    try {
        const { meetingId, email } = data;
        
        // Notify other participants
        socket.broadcast.emit('participant:joined', { meetingId, email });
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallLeave(socket, data) {
    try {
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
        // Handle error silently
    }
}

async function handleCallEnd(socket, data) {
    try {
        const { meetingId, hostEmail } = data;
        
        // Check if meeting exists and get its current state
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}`);
        let meetingState = null;
        let hasActiveParticipants = false;
        
        if (response.ok) {
            const result = await response.json();
            meetingState = result.meeting;
            // Check if any participants have joined (excluding host)
            hasActiveParticipants = meetingState.participants.some(p => p.email !== hostEmail);
        }
        
        // Clear timeout for this call if it exists and remove from pendingCalls
        const pendingCall = app.locals.pendingCalls.get(meetingId);
        
        if (pendingCall) {
            clearTimeout(pendingCall.timeoutId);
            app.locals.pendingCalls.delete(meetingId);
        }
        
        // This is an active call ending - notify all participants
        socket.broadcast.emit('call:ended', { meetingId });
        
        // End meeting via API call
        const endResponse = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'end', hostEmail })
        });
        
        if (!endResponse.ok) {
            // Handle error silently
        }
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallCancel(socket, data) {
    try {
        const { meetingId, hostEmail } = data;

        // Clear timeout for this call if it exists and remove from pendingCalls
        const pendingCall = app.locals.pendingCalls.get(meetingId);
        if (pendingCall) {
            clearTimeout(pendingCall.timeoutId); // Clear the timeout
            app.locals.pendingCalls.delete(meetingId);
        }

        // Only notify participants who haven't responded yet
        if (pendingCall) {
            const unrespondedParticipants = pendingCall.participants.filter(
                email => !pendingCall.respondedParticipants.has(email)
            );
            
            unrespondedParticipants.forEach(email => {
                const participantSocket = app.locals.connections.get(email);
                if (participantSocket) {
                    participantSocket.emit('call:cancelled', {
                        meetingId,
                        hostEmail,
                        reason: 'Call cancelled by host'
                    });
                }
            });
        }

        // End meeting via API call
        const response = await fetch(`http://localhost:3001/api/meetings/${meetingId}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'end', hostEmail })
        });

        if (!response.ok) {
            // Handle error silently
        }
    } catch (error) {
        // Handle error silently
    }
}

async function handleCallRejoin(socket, data) {
    try {
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
        // Handle error silently
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    // Server started
}); 