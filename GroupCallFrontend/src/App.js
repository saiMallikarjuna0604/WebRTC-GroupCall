/* eslint-disable no-unreachable */
import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import GroupCall from './components/GroupCall';
import Popover from './components/Popover';
import GroupsListPopover from './components/GroupsListPopover';
import IncomingCallPopup from './components/IncomingCallPopup';
import OutgoingCallPopup from './components/OutgoingCallPopup';
import CallStatusPopup from './components/CallStatusPopup';

function App() {
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const socketRef = useRef(null);

  // Popover state management
  const [popoverType, setPopoverType] = useState(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Call notification state management
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [callStatus, setCallStatus] = useState(null);
  const [showTimeoutMessage, setShowTimeoutMessage] = useState(false);

  const groupsPopoverRef = useRef(null);

  // Initialize Socket.IO connection - SINGLE SOCKET INSTANCE
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

      socketRef.current.on('group:member-exited', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      socketRef.current.on('group:deleted', (data) => {
        fetchPendingInvites();
        if (groupsPopoverRef.current) groupsPopoverRef.current.refreshGroups();
      });

      // Call invitation handling
      socketRef.current.on('call:invite', (data) => {
        const { meetingId, host, title } = data;
        setIncomingCall({ meetingId, host, title });
      });

      socketRef.current.on('call:accepted', (data) => {
        const { meetingId, email, hostEmail } = data;
        
        console.log('Call accepted by participant:', data);
        
        // If this is the host, navigate to video call and close outgoing popup
        // if (email === hostEmail) {
          console.log('Host navigating to video call after participant accepted');
          setActiveRoom(meetingId);
          setIsHost(true);
          setOutgoingCall(null);
          setShowTimeoutMessage(false);
          
          // Show success status message
          setCallStatus({
            type: 'success',
            title: 'Call Started',
            message: `${email} accepted the call`
          });
        // }
      });

      socketRef.current.on('call:declined', (data) => {
        const { meetingId, email } = data;
        // Don't dismiss outgoing call popup, just show status update
        setCallStatus({
          type: 'info',
          title: 'Participant Declined',
          message: `${email} declined the call`
        });
        // Keep outgoingCall state active for other participants
      });

      socketRef.current.on('call:ended', (data) => {
        const { meetingId } = data;
        
        // Dismiss incoming call popup if active for this meeting
        if (incomingCall && incomingCall.meetingId === meetingId) {
          setIncomingCall(null);
        }
        
        // Handle active room if user is in the call
        if (activeRoom === meetingId) {
          setActiveRoom(null);
          setCallStatus({
            type: 'ended',
            title: 'Call Ended',
            message: 'The call has ended'
          });
        }
      });

      socketRef.current.on('call:timeout', (data) => {
        const { meetingId } = data;
        
        console.log('call:timeout****', data, 'incomingCall', incomingCall, 'outgoingCall', outgoingCall);
        
        // Check if this timeout is relevant to the current user
        // const isRelevantTimeout = (
        //   (incomingCall && incomingCall.meetingId === meetingId) ||
        //   (outgoingCall && outgoingCall.meetingId === meetingId)
        // );
        
        // if (!isRelevantTimeout) {
        //   console.log('Timeout event not relevant to current user, ignoring');
        //   return;
        // }
        
        // Show timeout message immediately
        setShowTimeoutMessage(true);
        
        // Close popups after showing message for 2 seconds
        setTimeout(() => {
          setIncomingCall(null);
          setOutgoingCall(null);
          setShowTimeoutMessage(false);
        }, 2000);
        
        // Show timeout status message
        setCallStatus({
          type: 'timeout',
          title: 'Call Timeout',
          message: 'No one answered the call within 40 seconds'
        });
      });

      socketRef.current.on('call:cancelled', (data) => {
        const { meetingId, hostEmail, reason } = data;
        
        console.log('Call cancelled:', data, 'incomingCall', incomingCall, 'callStatus', callStatus);
        
        // Always close popups regardless of current state
        setIncomingCall(null);
        setOutgoingCall(null);
        
        // Show cancellation notification
        setCallStatus({
          type: 'info',
          title: 'Call Cancelled',
          message: reason || 'The call was cancelled by the host'
        });
      });

      // socketRef.current.on('disconnect', () => {
      //   console.log('Disconnected from server');
      //   socketRef.current = null;
      // });
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
    // Clear call states
    setIncomingCall(null);
    setOutgoingCall(null);
    setCallStatus(null);
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
   setIsHost(false);
  };

  const handleAcceptInvite = (meetingId) => {
    socketRef.current.emit('call:accept', {
      meetingId,
      email: email
    });
    setActiveRoom(meetingId);
    setIsHost(false); // User is a participant, not host
  };

  const handleDeclineInvite = (meetingId, host) => {
    socketRef.current.emit('call:decline', {
      meetingId,
      email: email,
      hostEmail: host
    });
  };

  // Call popup handlers
  const handleIncomingCallAccept = () => {
    if (incomingCall) {
      socketRef.current.emit('call:accept', {
        meetingId: incomingCall.meetingId,
        email: email
      });
      setActiveRoom(incomingCall.meetingId);
      setIncomingCall(null);
      setShowTimeoutMessage(false);
    }
  };

  const handleIncomingCallDecline = () => {
    if (incomingCall) {
      socketRef.current.emit('call:decline', {
        meetingId: incomingCall.meetingId,
        email: email,
        hostEmail: incomingCall.host
      });
      setIncomingCall(null);
      setShowTimeoutMessage(false);
    }
  };

  const handleIncomingCallTimeout = () => {
    // This function is called by the IncomingCallPopup after showing the timeout message
    setIncomingCall(null);
    setShowTimeoutMessage(false);
  };

  const handleOutgoingCallCancel = () => {
    if (outgoingCall) {
      socketRef.current.emit('call:cancel', {
        meetingId: outgoingCall.meetingId,
        hostEmail: email
      });
      setOutgoingCall(null);
      setIncomingCall(null);
      setActiveRoom(null);
      setShowTimeoutMessage(false);
    }
  };

  const handleCallStatusClose = () => {
    setCallStatus(null);
  };

  // Call popup handlers
  // const handleIncomingCallAccept = () => {
  //   if (incomingCall) {
  //     socketRef.current.emit('call:accept', {
  //       meetingId: incomingCall.meetingId,
  //       email: email
  //     });
  //     setActiveRoom(incomingCall.meetingId);
  //     setIncomingCall(null);
  //     setShowTimeoutMessage(false);
  //   }
  // };

  // const handleIncomingCallDecline = () => {
  //   if (incomingCall) {
  //     socketRef.current.emit('call:decline', {
  //       meetingId: incomingCall.meetingId,
  //       email: email,
  //       hostEmail: incomingCall.host
  //     });
  //     setIncomingCall(null);
  //     setShowTimeoutMessage(false);
  //   }
  // };

  // const handleIncomingCallTimeout = () => {
  //   // This function is called by the IncomingCallPopup after showing the timeout message
  //   setIncomingCall(null);
  //   setShowTimeoutMessage(false);
  // };

  // const handleOutgoingCallCancel = () => {
  //   if (outgoingCall) {
  //     socketRef.current.emit('call:cancel', {
  //       meetingId: outgoingCall.meetingId,
  //       hostEmail: email
  //     });
  //     setOutgoingCall(null);
  //     setIncomingCall(null);
  //     setActiveRoom(null);
  //     setShowTimeoutMessage(false);
  //   }
  // };

  // const handleCallStatusClose = () => {
  //   setCallStatus(null);
  // };

  // Popover action handlers
  const handlePopoverAction = async (action, data) => {
    switch (action) {
      case 'start-call':
        try {
          console.log('Starting call with:', data);
          
          // Unified participant extraction and validation
          let participants, title;
          
          if (Array.isArray(data)) {
            // From InitiateCallPopover - array of user objects
            participants = data.map(user => user.email);
            title = 'Group Call';
          } else if (data.members) {
            // From GroupsListPopover - group object
            participants = data.members
              .filter(member => member.status === 'accepted')
              .map(member => member.email);
            title = `Group Call - ${data.name}`;
          } else {
            throw new Error('Invalid data format for call initiation');
          }
          
          if (participants.length === 0) {
            setCallStatus({
              type: 'error',
              title: 'No Participants',
              message: 'No participants available for the call.'
            });
            return;
          }

          console.log(participants,'-----participants-----');
          
          // Create meeting
          const response = await fetch('http://localhost:3001/api/meetings/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hostEmail: email,
              participants: participants,
              title: title
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create meeting');
          }
          
          const result = await response.json();
          
          // Show outgoing call popup
          setOutgoingCall({
            meetingId: result.meeting.meetingId,
            participants: participants,
            title: title
          });
          
          // Send call invitations
          socketRef.current.emit('call:initiate', {
            hostEmail: email,
            participants: participants,
            title: title,
            meetingId: result.meeting.meetingId
          });
          
          // Don't show separate status popup - integrated into outgoing call popup
        } catch (error) {
          console.error('Error starting call:', error);
          // Show error status popup for call initiation errors
          setCallStatus({
            type: 'error',
            title: 'Call Failed',
            message: `Failed to start call: ${error.message}`
          });
        }
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
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create group');
          }
          
          const result = await response.json();
          console.log('Group created successfully:', result);
          setCallStatus({
            type: 'success',
            title: 'Group Created',
            message: 'Group created successfully!'
          });
        } catch (error) {
          console.error('Error creating group:', error);
          setCallStatus({
            type: 'error',
            title: 'Group Creation Failed',
            message: `Error creating group: ${error.message}`
          });
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
          user={{ id: email, name: email, email: email }}
          onLeave={handleLeave}
          meetingId={activeRoom}
          socket={socketRef.current}
          isHost={isHost}
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
        socket={socketRef.current}

      />

      {/* Call Popup Components */}
      {incomingCall && (
        <IncomingCallPopup
          call={incomingCall}
          onAccept={handleIncomingCallAccept}
          onDecline={handleIncomingCallDecline}
          onTimeout={handleIncomingCallTimeout}
          showTimeoutMessage={showTimeoutMessage}
        />
      )}

      {outgoingCall && (
        <OutgoingCallPopup
          call={outgoingCall}
          onCancel={handleOutgoingCallCancel}
          socket={socketRef.current}
          showTimeoutMessage={showTimeoutMessage}
          setOutgoingCall={setOutgoingCall}
        />
      )}

      {callStatus && (
        <CallStatusPopup
          status={callStatus}
          onClose={handleCallStatusClose}
        />
      )}
    </div>
  );
}

export default App;
