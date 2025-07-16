import React, { useEffect, useRef, useState } from 'react';
import './CallPopup.css';

const IncomingCallPopup = ({ call, onAccept, onDecline, onTimeout, showTimeoutMessage }) => {
  const audioRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(40); // 40 seconds countdown for visual feedback only

  useEffect(() => {
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

    // Play ringtone (optional - can be disabled)
    if (audioRef.current) {
      audioRef.current.loop = true;
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }

    return () => {
      clearInterval(countdownInterval);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  const handleAccept = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    onAccept();
  };

  const handleDecline = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    onDecline();
  };

  const getProfileInitial = (email) => {
    return email.charAt(0).toUpperCase();
  };

  console.log('timeLeft', timeLeft);

  return (
    <div className="call-popup-overlay">
      <div className="call-popup incoming-call">
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
                <div className="caller-avatar ringing">
                  {getProfileInitial(call.host)}
                </div>
                <div className="caller-details">
                  <h3 className="caller-name">{call.host.split('@')[0]}</h3>
                  <p className="caller-email">{call.host}</p>
                </div>
              </div>
            </div>

            <div className="call-popup-content">
              <div className="call-title">
                <h2>{call.title || 'Group Call'}</h2>
                <p className="call-status">Incoming call...</p>
                <div className="countdown-timer">
                  <span className="timer-label">Call will timeout in:</span>
                  <span className={`timer-value`}>
                    {timeLeft}s
                  </span>
                </div>
              </div>

              <div className="call-actions">
                <button 
                  className="call-action-btn accept-btn"
                  onClick={handleAccept}
                >
                  <span className="btn-icon">📞</span>
                  <span className="btn-text">Accept</span>
                </button>
                
                <button 
                  className="call-action-btn decline-btn"
                  onClick={handleDecline}
                >
                  <span className="btn-icon">❌</span>
                  <span className="btn-text">Decline</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Hidden audio element for ringtone */}
        <audio ref={audioRef} preload="auto">
          <source src="/ringtone.mp3" type="audio/mpeg" />
        </audio>
      </div>
    </div>
  );
};

export default IncomingCallPopup; 