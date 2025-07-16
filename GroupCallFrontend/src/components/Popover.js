import React, { forwardRef } from 'react';
import GroupsListPopover from './GroupsListPopover';
import InitiateCallPopover from './InitiateCallPopover';
import CreateGroupPopover from './CreateGroupPopover';

const Popover = forwardRef(({ type, isOpen, onClose, data, onAction, currentUserEmail, socket, inviteData, onAcceptInvite, onDeclineInvite }, ref) => {
  if (!isOpen) return null;

  const renderContent = () => {
    switch (type) {
      case 'groups':
        return <GroupsListPopover ref={ref} data={data} onClose={onClose} onAction={onAction} currentUserEmail={currentUserEmail} socket={socket} />;
      case 'initiate':
        return <InitiateCallPopover data={data} onClose={onClose} onAction={onAction} currentUserEmail={currentUserEmail} />;
      case 'create':
        return <CreateGroupPopover data={data} onClose={onClose} onAction={onAction} currentUserEmail={currentUserEmail} />;
      default:
        return null;
    }
  };

  return (
    <div className="popover-overlay" onClick={onClose}>
      <div className="popover-content" onClick={(e) => e.stopPropagation()}>
        {renderContent()}
      </div>
    </div>
  );
});

export default Popover; 