const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');

const cors = require('cors');

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

// MongoDB Connection
const uri="mongodb+srv://mallikarjunasai174:kcG172JQcgRHGbXR@myprojects.rse9hc8.mongodb.net/webrtc_app"

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Store socket connections
const connections = new Map();

// API Routes
app.post('/api/users/login', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Find or create user
        let user = await User.findOne({ email });
        if (!user) {
            user = await User.create({ 
                email,
                status: 'online',
                lastActive: new Date()
            });
        } else {
            user.status = 'online';
            user.lastActive = new Date();
            await user.save();
        }

        // Get all users for initial list
        const allUsers = await User.find({}, { email: 1, status: 1, lastActive: 1, registeredAt: 1 });
        
        res.json({ 
            user,
            allUsers
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get all users (online and offline)
app.get('/api/users/all', async (req, res) => {
    try {
        const users = await User.find({}, { email: 1, status: 1, lastActive: 1, registeredAt: 1 });
        res.json({ users });
    } catch (error) {
        console.error('Error fetching all users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Unified GET /api/groups endpoint with query params
app.get('/api/groups', async (req, res) => {
    try {
        const { userEmail, status } = req.query;
        let query = { isActive: true };
        if (userEmail) {
            query['members.email'] = userEmail;
        }
        if (status) {
            query['members.status'] = status;
        }
        const groups = await Group.find(query).sort({ createdAt: -1 });
        res.json({ groups });
    } catch (error) {
        console.error('Unified GET /api/groups error:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// Create a new group
app.post('/api/groups', async (req, res) => {
    try {
        const { name, members, createdBy } = req.body;
        
        if (!name || !members || !createdBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Format members with status
        const formattedMembers = members.map(email => ({
            email,
            status: email === createdBy ? 'accepted' : 'pending'
        }));

        const group = await Group.create({
            name,
            members: formattedMembers,
            createdBy
        });

        // Notify all members about the new group
        members.forEach(memberEmail => {
            const memberSocket = connections.get(memberEmail);
            if (memberSocket) {
                memberSocket.emit('group:invite', {
                    group: group,
                    createdBy: createdBy
                });
            }
        });

        res.json({ group });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// Unified group member action endpoint
app.patch('/api/groups/:groupId/member', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { action, targetEmail, actorEmail, newMembers } = req.body;
        const group = await Group.findById(groupId);
        console.log(group,'-----group-----');
        if (!group) return res.status(404).json({ error: 'Group not found' });

        if (action === 'accept') {
            // Only the target can accept
            if (targetEmail !== actorEmail) return res.status(403).json({ error: 'Not allowed' });
            const memberIndex = group.members.findIndex(m => m.email === targetEmail);
            if (memberIndex !== -1) {
                group.members[memberIndex].status = 'accepted';
                await group.save();
                // Notify creator
                const creatorSocket = connections.get(group.createdBy);
                if (creatorSocket) {
                    creatorSocket.emit('group:member-accepted', { groupId, userEmail: targetEmail });
                }
            }
            return res.json({ group });
        }
        if (action === 'decline') {
            // Only the target can decline
            if (targetEmail !== actorEmail) return res.status(403).json({ error: 'Not allowed' });
            group.members = group.members.filter(m => m.email !== targetEmail);
            await group.save();
            // Notify creator
            const creatorSocket = connections.get(group.createdBy);
            if (creatorSocket) {
                creatorSocket.emit('group:member-declined', { groupId, userEmail: targetEmail });
            }
            return res.json({ group });
        }
        if (action === 'add') {
            // Only creator can add
            if (group.createdBy !== actorEmail) return res.status(403).json({ error: 'Only creator can add' });
            // newMembers: array of emails
            const existingEmails = group.members.map(m => m.email);
            const toAdd = (newMembers || []).filter(email => !existingEmails.includes(email));
            toAdd.forEach(email => {
                group.members.push({ email, status: 'pending' });
            });
            await group.save();
            // Notify new members
            toAdd.forEach(email => {
                const memberSocket = connections.get(email);
                if (memberSocket) {
                    memberSocket.emit('group:invite', { group, createdBy: actorEmail });
                }
            });
            return res.json({ group });
        }
        if (action === 'remove') {
            // Only creator can remove
            if (group.createdBy !== actorEmail) return res.status(403).json({ error: 'Only creator can remove' });
            group.members = group.members.filter(m => m.email !== targetEmail);
            await group.save();
            // Notify removed member
            const memberSocket = connections.get(targetEmail);
            if (memberSocket) {
                memberSocket.emit('group:member-removed', { groupId, groupName: group.name });
            }
            return res.json({ group });
        }
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('Unified group member action error:', error);
        res.status(500).json({ error: 'Failed to update group member' });
    }
});

// Delete group (creator only)
app.delete('/api/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { creatorEmail } = req.body;

        const group = await Group.findById(groupId);
        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        if (group.createdBy !== creatorEmail) {
            return res.status(403).json({ error: 'Only creator can delete group' });
        }

        group.isActive = false;
        await group.save();

        // Notify all members
        group.members.forEach(member => {
            const memberSocket = connections.get(member.email);
            if (memberSocket) {
                memberSocket.emit('group:deleted', {
                    groupId,
                    groupName: group.name
                });
            }
        });

        res.json({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Error deleting group:', error);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// Socket.IO connection handling
io.on('connection', async (socket) => {
    console.log('New client connected');
    let userEmail = null;

    socket.on('register', async (data) => {
        try {
            userEmail = data.email;
            connections.set(userEmail, socket);
            
            // Update user status
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

    socket.on('disconnect', async () => {
        if (userEmail) {
            connections.delete(userEmail);
            
            // Update user status
            await User.findOneAndUpdate(
                { email: userEmail },
                { status: 'offline', lastActive: new Date() }
            );

            // Get complete updated user data
          
            // Broadcast to others with complete user data
            socket.broadcast.emit('user:status', {
                email: userEmail,
                status: 'offline'
            });
        }
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 