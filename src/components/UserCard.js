import React from 'react';

const UserCard = ({ user, isSelected, onSelect, selectionType = 'checkbox' }) => {
  const getProfileInitial = (email) => {
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className={`user-card ${isSelected ? 'selected' : ''}`}>
      <div className="user-card-content">
        <div className="user-avatar">{getProfileInitial(user.email)}</div>
        <div className="user-info">
          <span className="user-name">{user.email.split('@')[0]}</span>
          <span className="user-email">{user.email}</span>
          <div className="user-status">
            <span className={`status-dot ${user.status === 'online' ? 'online' : 'offline'}`}></span>
            <span>{user.status === 'online' ? 'Online' : 'Offline'}</span>
          </div>
        </div>
        <div className="user-selection">
          {selectionType === 'checkbox' ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(user)}
              className="user-checkbox"
            />
          ) : (
            <input
              type="radio"
              checked={isSelected}
              onChange={() => onSelect(user)}
              name="user-selection"
              className="user-radio"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default UserCard; 