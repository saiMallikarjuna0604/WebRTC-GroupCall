import React, { useState, useEffect } from 'react';
import UserCard from './UserCard';

const CreateGroupPopover = ({ data, onClose, onAction, currentUserEmail }) => {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/users/all');
      const data = await response.json();
      // Filter out current user from the list
      const filteredUsers = data.users?.filter(user => user.email !== currentUserEmail) || [];
      setAllUsers(filteredUsers);
    } catch (error) {
      console.error('Error fetching all users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (user) => {
    setSelectedUsers(prev => {
      const isSelected = prev.some(u => u.email === user.email);
      if (isSelected) {
        return prev.filter(u => u.email !== user.email);
      } else {
        return [...prev, user];
      }
    });
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedUsers.length > 0) {
      // Include current user in the group members
      const allMembers = [...selectedUsers.map(u => u.email), currentUserEmail];
      onAction('create-group', {
        name: groupName,
        members: allMembers
      });
      onClose();
    }
  };

  const isUserSelected = (user) => {
    return selectedUsers.some(u => u.email === user.email);
  };

  if (loading) {
    return (
      <div className="popover-header">
        <h3>Create Group</h3>
        <div className="loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="popover-container">
      <div className="popover-header">
        <h3>Create Group</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="popover-body">
        <div className="group-name-input">
          <label htmlFor="groupName">Group Name:</label>
          <input
            type="text"
            id="groupName"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter group name"
            className="group-name-field"
          />
        </div>
        
        <p className="popover-description">
          Select users to add to the group (online and offline users will be notified)
        </p>
        
        {allUsers.length === 0 ? (
          <div className="empty-state">
            <p>No users available</p>
          </div>
        ) : (
          <div className="users-list">
            {allUsers.map((user) => (
              <UserCard
                key={user.email}
                user={user}
                isSelected={isUserSelected(user)}
                onSelect={handleUserSelect}
                selectionType="checkbox"
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="popover-footer">
        <button className="cancel-button" onClick={onClose}>Cancel</button>
        <button 
          className="action-button" 
          onClick={handleCreateGroup}
          disabled={!groupName.trim() || selectedUsers.length === 0}
        >
          Create Group ({selectedUsers.length} selected)
        </button>
      </div>
    </div>
  );
};

export default CreateGroupPopover; 