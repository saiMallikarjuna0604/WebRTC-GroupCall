const express = require('express');
const Group = require('../models/Group');
const router = express.Router();

// Unified GET /api/groups endpoint with query params
router.get('/', async (req, res) => {
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
router.post('/', async (req, res) => {
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
      const memberSocket = req.app.locals.connections.get(memberEmail);
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
router.patch('/:groupId/member', async (req, res) => {
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
        const creatorSocket = req.app.locals.connections.get(group.createdBy);
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
      const creatorSocket = req.app.locals.connections.get(group.createdBy);
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
        const memberSocket = req.app.locals.connections.get(email);
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
      const memberSocket = req.app.locals.connections.get(targetEmail);
      if (memberSocket) {
        memberSocket.emit('group:member-removed', { groupId, groupName: group.name });
      }
      return res.json({ group });
    }
    if (action === 'exit') {
      // Only the target can exit (self-exit)
      if (targetEmail !== actorEmail) return res.status(403).json({ error: 'Not allowed' });
      
      // Check if user is an accepted member
      const member = group.members.find(m => m.email === targetEmail);
      if (!member || member.status !== 'accepted') {
        return res.status(400).json({ error: 'User is not an accepted member' });
      }
      
      // Remove the member from the group
      group.members = group.members.filter(m => m.email !== targetEmail);
      await group.save();
      
      // Notify the group creator
      const creatorSocket = req.app.locals.connections.get(group.createdBy);
      if (creatorSocket) {
        creatorSocket.emit('group:member-exited', { 
          groupId, 
          userEmail: targetEmail,
          groupName: group.name 
        });
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
router.delete('/:groupId', async (req, res) => {
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
      const memberSocket = req.app.locals.connections.get(member.email);
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

module.exports = router; 