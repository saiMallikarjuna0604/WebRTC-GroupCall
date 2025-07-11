/* eslint-disable no-unreachable */
import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import GroupCall from './components/GroupCall';
import Popover from './components/Popover';
import GroupsListPopover from './components/GroupsListPopover';

function App() {
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const socketRef = useRef(null);

  // Popover state management
  const [popoverType, setPopoverType] = useState(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);

  const groupsPopoverRef = useRef(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    if (isLoggedIn && !socketRef.current) {
      socketRef.current = io('http://localhost:3001');
      
      socketRef.current.on('connect', () => {
        console.log('Connected to server');
        // Register user
        socketRef.current.emit('register', {
          email: email
        });
      });

      socketRef.current.on('user:status', (data) => {
        console.log('User status update:', data);
        const userExists = onlineUsers.some(user => user.email === data.email);

        console.log(userExists,'-----userExists-----');
        console.log(onlineUsers,'-----onlineUsers-----');
        console.log(data,'-----data-----');
        
        if (userExists) {
         
          setOnlineUsers(prev => (
            prev.map(user => user.email === data.email ? {
              ...user,
              status: data.status
            } : user)
          ));
          // setOnlineUsers(updatedUsers);
        } else {
          // Add new user with all fields
          setOnlineUsers(prev => [...prev, {
            email: data.email,
            status: data.status
          }]);
        }
      });

      // Handle group creation notifications
      socketRef.current.on('group:invite', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      // Handle group status updates
      socketRef.current.on('group:member-accepted', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      socketRef.current.on('group:member-declined', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      socketRef.current.on('group:member-removed', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      socketRef.current.on('group:deleted', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      socketRef.current.on('disconnect', () => {
        console.log('Disconnected from server');
        socketRef.current = null;
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isLoggedIn, email]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (email && email.includes('@')) {
      try {
        const response = await fetch('http://localhost:3001/api/users/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        });

        const data = await response.json();
        if (data.user) {
          setIsLoggedIn(true);
          setOnlineUsers(data.allUsers);
          fetchPendingInvites(); // Fetch pending invites after successful login
        }
      } catch (error) {
        console.error('Login failed:', error);
        alert('Login failed. Please try again.');
      }
    } else {
      alert('Please enter a valid email address');
    }
  };

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsLoggedIn(false);
    setEmail('');
    setActiveRoom(null);
    setOnlineUsers([]);
    setPendingInvites([]);
  };

  const fetchPendingInvites = async () => {
    if (!email) return;
    try {
      const response = await fetch(`http://localhost:3001/api/groups?userEmail=${encodeURIComponent(email)}&status=pending`);
      const data = await response.json();
      setPendingInvites(data.groups || []);
    } catch (error) {
      console.error('Error fetching pending invites:', error);
    }
  };

  const getProfileInitial = (userEmail) => {
    return userEmail.charAt(0).toUpperCase();
  };

  const handleLeave = () => {
    setActiveRoom(null);
  };

  // Popover action handlers
  const handlePopoverAction = async (action, data) => {
    switch (action) {
      case 'start-call':
        console.log('Starting call with:', data);
        // TODO: Implement group call logic
        break;
      case 'create-group':
        try {
          const response = await fetch('http://localhost:3001/api/groups', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: data.name,
              members: data.members,
              createdBy: email
            })
          });
          
          if (response.ok) {
            const result = await response.json();
            console.log('Group created successfully:', result);
            alert('Group created successfully!');
          } else {
            console.error('Failed to create group');
            alert('Failed to create group. Please try again.');
          }
        } catch (error) {
          console.error('Error creating group:', error);
          alert('Error creating group. Please try again.');
        }
        break;
      default:
        console.log('Unknown action:', action);
    }
  };

  const openPopover = (type) => {
    setPopoverType(type);
    setIsPopoverOpen(true);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
    setPopoverType(null);
  };

  console.log('Current online users:', onlineUsers);

  return (
    <div className="App">
      {!isLoggedIn ? (
        <div className="landing-container">
          <div className="landing-content">
            <div className="welcome-section">
              <h1>Welcome to RealTime Connect</h1>
              <p className="welcome-description">
                Experience seamless video calling with your team members. Connect instantly,
                collaborate effectively, and stay productive from anywhere.
              </p>
              <div className="feature-list">
                <div className="feature-item">
                  <span className="feature-icon">🎥</span>
                  <span>HD Video Quality</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">🔒</span>
                  <span>Secure Connection</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">👥</span>
                  <span>Group Calling</span>
                </div>
              </div>
            </div>
            <div className="login-section">
              <div className="login-box">
                <h2>Get Started</h2>
                <p className="login-description">Enter your email to join the conversation</p>
                <form onSubmit={handleLogin}>
                  <div className="input-group">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="login-button">
                    Join Now
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      ) : !activeRoom ? (
        <div className="main-container">
          <div className="header">
            <div className="user-info">
              <div className="avatar">{getProfileInitial(email)}</div>
              <span className="user-email">{email}</span>
            </div>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
          
          <div className="dashboard">
            <div className="welcome-message">
              <div className="welcome-text">
                <h2>Welcome, {email.split('@')[0]}!</h2>
                <p>Start a video call with your team members</p>
                <p> Initiate Group Call - To start a group call with the online members.</p>
                <p> Create Group - To Start a group call with all the members, Will Notify offline users.</p>
                <p> Analytics - To view analytics, click the "Analytics" button.</p>
              </div>
              <div className="dashboard-actions">
                <button className="dashboard-button groups-list" onClick={() => openPopover('groups')}>
                  <span>📋</span>
                  Groups List
                  {pendingInvites.length > 0 && (
                    <span className="notification-badge">{pendingInvites.length}</span>
                  )}
                </button>
                <button className="dashboard-button initiate-call" onClick={() => openPopover('initiate')}>
                  <span>🎥</span>
                  Initiate Group Call
                </button>
                <button className="dashboard-button group-call" onClick={() => openPopover('create')}>
                  <span>👥</span>
                  Create Group 
                </button>
                <button className="dashboard-button analytics">
                  <span>📊</span>
                  Analytics
                </button>
              </div>
            </div>
            
            <div className="members-section">
              <h3>Online Members</h3>
              <div className="members-grid">
                {onlineUsers
                  .filter(user => user.email !== email)
                  .map((user) => (
                    <div key={user.email} className="member-card">
                      <div className="member-avatar">{getProfileInitial(user.email)}</div>
                      <div className="member-info">
                        <span className="member-name">{user.email.split('@')[0]}</span>
                        <span className="member-email">{user.email}</span>
                        <div className="member-status">
                          <span className={`status-dot ${user.status === 'online' ? 'online' : 'offline'}`}></span>
                          <span>{user.status === 'online' ? 'Online' : 'Offline'}</span>
                        </div>
                      </div>
                        
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <GroupCall
          user={{ id: email, name: email }}
          onLeave={handleLeave}
          initialParticipants={[email, activeRoom]}
        />
      )}
      
      {/* Popover Component */}
      <Popover
        ref={groupsPopoverRef}
        type={popoverType}
        isOpen={isPopoverOpen}
        onClose={closePopover}
        data={onlineUsers}
        onAction={handlePopoverAction}
        currentUserEmail={email}
      />
    </div>
  );
}

export default App;
