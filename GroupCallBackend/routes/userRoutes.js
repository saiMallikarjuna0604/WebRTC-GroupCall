const express = require('express');
const User = require('../models/User');
const router = express.Router();

// User login endpoint
router.post('/login', async (req, res) => {
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

// Get all users endpoint
router.get('/all', async (req, res) => {
  try {
    const users = await User.find({}, { email: 1, status: 1, lastActive: 1, registeredAt: 1 });
    res.json({ users });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router; 