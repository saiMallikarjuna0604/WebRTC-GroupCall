import React, { useEffect, useState } from 'react';
import './CallPopup.css';

const OutgoingCallPopup = ({ call, onCancel, socket, showTimeoutMessage, setOutgoingCall }) => {
  const [participantStatuses, setParticipantStatuses] = useState({});
  const [callStatus, setCallStatus] = useState(null);
  const [timeLeft, setTimeLeft] = useState(40); // 40 seconds countdown for visual feedback only

  useEffect(() => {
    // Initialize participant statuses
    const initialStatuses = {};
    call.participants.forEach(email => {
      initialStatuses[email] = 'ringing';
    });
    setParticipantStatuses(initialStatuses);
    
    // Set initial call status
    if (call.error) {
      setCallStatus({
        type: 'error',
        message: call.error
      });
    } else {
      setCallStatus({
        type: 'success',
        message: 'Call invitations sent successfully!'
      });
    }

    // Countdown timer for visual feedback only (no auto-close)
    const countdownInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, [call.participants, call.error]);

  const getProgressSummary = () => {
    const answered = Object.values(participantStatuses).filter(status => status === 'answered').length;
    const declined = Object.values(participantStatuses).filter(status => status === 'declined').length;
    const timeout = Object.values(participantStatuses).filter(status => status === 'timeout').length;
    const total = call.participants.length;
    
    return { answered, declined, timeout, total };
  };

  // Listen for participant status updates
  useEffect(() => {
    if (!socket) return;

    const handleParticipantUpdate = (data) => {
      const { email, status } = data;
      if (call.participants.includes(email)) {
        setParticipantStatuses(prev => {
          const newStatuses = {
            ...prev,
            [email]: status
          };
          
          // Calculate progress summary with updated statuses
          const answered = Object.values(newStatuses).filter(s => s === 'answered').length;
          const declined = Object.values(newStatuses).filter(s => s === 'declined').length;
          
          // Update call status based on participant responses
          if (answered > 0) {
            setCallStatus({
              type: 'success',
              message: `${answered} participant${answered !== 1 ? 's' : ''} answered`
            });
          } else if (declined > 0) {
            setCallStatus({
              type: 'info',
              message: `${declined} participant${declined !== 1 ? 's' : ''} declined`
            });
          }
          
          return newStatuses;
        });
      }
    };

    // Add event listeners for participant updates
    socket.on('participant:joined', (data) => {
      handleParticipantUpdate({ email: data.email, status: 'answered' });
    });
    
    socket.on('call:declined', (data) => {
      handleParticipantUpdate({ email: data.email, status: 'declined' });
    });

    socket.on('call:timeout', (data) => {
      if (data.participants) {
        data.participants.forEach(email => {
          handleParticipantUpdate({ email, status: 'timeout' });
        });
        setOutgoingCall(null);
      }
    });

    // New granular status update events
    socket.on('participant:status-update', (data) => {
      handleParticipantUpdate({ email: data.email, status: data.status });
    });

    // Cleanup event listeners
    return () => {
      socket.off('participant:joined');
      socket.off('call:declined');
      socket.off('call:timeout');
      socket.off('participant:status-update');
    };
  }, [call.participants, socket]);

  const handleCancel = () => {
    onCancel();
  };

  const getProfileInitial = (email) => {
    return email.charAt(0).toUpperCase();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ringing':
        return '📞';
      case 'answered':
        return '✅';
      case 'declined':
        return '❌';
      case 'timeout':
        return '⏰';
      default:
        return '📞';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'ringing':
        return 'Ringing...';
      case 'answered':
        return 'Answered';
      case 'declined':
        return 'Declined';
      case 'timeout':
        return 'No Answer';
      default:
        return 'Ringing...';
    }
  };

  const getCallStatusIcon = (type) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  const progressSummary = getProgressSummary();

  return (
    <div className="call-popup-overlay">
      <div className="call-popup outgoing-call">
        {showTimeoutMessage ? (
          // Timeout message view
          <div className="timeout-message">
            <div className="timeout-icon">⏰</div>
            <h3>Call Timeout</h3>
            <p>No one answered the call within 40 seconds</p>
            <div className="timeout-countdown">Closing in 2 seconds...</div>
          </div>
        ) : (
          // Normal call view
          <>
            <div className="call-popup-header">
              <div className="caller-info">
                <div className="caller-avatar">
                  <span className="btn-icon">📞</span>
                </div>
                <div className="caller-details">
                  <h3 className="caller-name">Outgoing Call</h3>
                  <p className="caller-email">{call.title || 'Group Call'}</p>
                  {callStatus && (
                    <div className={`inline-status status-${callStatus.type}`}>
                      <span className="status-icon">{getCallStatusIcon(callStatus.type)}</span>
                      <span className="status-text">{callStatus.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="call-popup-content">
              <div className="call-title">
                <h2>Calling...</h2>
                <p className="call-status">
                  {progressSummary.answered} answered, {progressSummary.declined} declined, {progressSummary.timeout} no answer
                </p>
                <div className="countdown-timer">
                  <span className="timer-label">Call will timeout in:</span>
                  <span className={`timer-value ${timeLeft <= 10 ? 'urgent' : ''}`}>
                    {timeLeft}s
                  </span>
                </div>
              </div>

              <div className="participants-list">
                <h4>Participants ({call.participants.length})</h4>
                {call.participants.map((email) => (
                  <div 
                    key={email} 
                    className={`participant-item status-${participantStatuses[email] || 'ringing'}`}
                  >
                    <div className="participant-avatar">
                      {getProfileInitial(email)}
                    </div>
                    <div className="participant-info">
                      <span className="participant-name">{email.split('@')[0]}</span>
                      <span className="participant-email">{email}</span>
                    </div>
                    <div className="participant-status">
                      <span className="status-icon">
                        {getStatusIcon(participantStatuses[email] || 'ringing')}
                      </span>
                      <span className="status-text">
                        {getStatusText(participantStatuses[email] || 'ringing')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="call-actions">
                <button 
                  className="call-action-btn cancel-btn"
                  onClick={handleCancel}
                >
                  <span className="btn-icon">❌</span>
                  <span className="btn-text">Cancel Call</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OutgoingCallPopup; 