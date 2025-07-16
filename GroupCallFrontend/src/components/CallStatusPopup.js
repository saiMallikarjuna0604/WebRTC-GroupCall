import React, { useEffect, useRef } from 'react';
import './CallPopup.css';

const CallStatusPopup = ({ status, onClose }) => {
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Auto-dismiss after 3 seconds
    timeoutRef.current = setTimeout(() => {
      onClose();
    }, 3000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onClose]);

  const handleClose = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    onClose();
  };

  const getStatusIcon = (type) => {
    switch (type) {
      case 'declined':
        return '❌';
      case 'ended':
        return '📞';
      case 'timeout':
        return '⏰';
      case 'error':
        return '⚠️';
      case 'success':
        return '✅';
      case 'info':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  const getStatusClass = (type) => {
    switch (type) {
      case 'declined':
        return 'status-declined';
      case 'ended':
        return 'status-ended';
      case 'timeout':
        return 'status-timeout';
      case 'error':
        return 'status-error';
      case 'success':
        return 'status-success';
      case 'info':
        return 'status-info';
      default:
        return 'status-info';
    }
  };

  return (
    <div className="call-popup-overlay">
      <div className={`call-popup call-status-popup ${getStatusClass(status.type)}`}>
        <div className="call-popup-header">
          <div className="caller-info">
            <div className="caller-avatar">
              <span className="btn-icon">{getStatusIcon(status.type)}</span>
            </div>
            <div className="caller-details">
              <h3 className="caller-name">Call Status</h3>
            </div>
          </div>
        </div>

        <div className="call-popup-content">
          <div className="call-title">
            <h2>{status.title || 'Call Update'}</h2>
            <p className="call-status">{status.message}</p>
          </div>

          <div className="call-actions">
            <button 
              className="call-action-btn close-btn"
              onClick={handleClose}
            >
              <span className="btn-text">Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallStatusPopup; 