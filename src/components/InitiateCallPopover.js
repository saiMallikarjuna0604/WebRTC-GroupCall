import React, { useState } from 'react';
import UserCard from './UserCard';

const InitiateCallPopover = ({ data, onClose, onAction, currentUserEmail }) => {
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Filter only online users and exclude current user
  const onlineUsers = data?.filter(user => 
    user.status === 'online' && user.email !== currentUserEmail
  ) || [];

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

  const handleStartCall = () => {
    if (selectedUsers.length > 0) {
      onAction('start-call', selectedUsers);
      onClose();
    }
  };

  const isUserSelected = (user) => {
    return selectedUsers.some(u => u.email === user.email);
  };

  return (
    <div className="popover-container">
      <div className="popover-header">
        <h3>Initiate Group Call</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      
      <div className="popover-body">
        <p className="popover-description">
          Select online users to start a group call
        </p>
        
        {onlineUsers.length === 0 ? (
          <div className="empty-state">
            <p>No online users available</p>
            <p>Wait for users to come online</p>
          </div>
        ) : (
          <div className="users-list">
            {onlineUsers.map((user) => (
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
          onClick={handleStartCall}
          disabled={selectedUsers.length === 0}
        >
          Start Call ({selectedUsers.length} selected)
        </button>
      </div>
    </div>
  );
};

export default InitiateCallPopover; 