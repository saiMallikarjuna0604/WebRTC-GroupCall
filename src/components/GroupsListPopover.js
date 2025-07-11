import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';

const GroupsListPopover = forwardRef(({ data, onClose, onAction, currentUserEmail, onGroupsRefresh }, ref) => {
  const [userGroups, setUserGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalGroup, setAddModalGroup] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedToAdd, setSelectedToAdd] = useState([]);

  useImperativeHandle(ref, () => ({
    refreshGroups: fetchUserGroups
  }));

  useEffect(() => {
    fetchUserGroups();
  }, []);

  // Fetch all users for add modal
  const fetchAllUsers = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/users/all');
      const data = await response.json();
      setAllUsers(data.users || []);
    } catch (error) {
      setAllUsers([]);
    }
  };

  // Fetch user groups using unified endpoint
  async function fetchUserGroups() {
    try {
      const response = await fetch(`http://localhost:3001/api/groups?userEmail=${encodeURIComponent(currentUserEmail)}`);
      const data = await response.json();
      setUserGroups(data.groups || []);
      if (onGroupsRefresh) onGroupsRefresh();
    } catch (error) {
      console.error('Error fetching user groups:', error);
    } finally {
      setLoading(false);
    }
  }

  const openAddModal = (group) => {
    setAddModalGroup(group);
    setSelectedToAdd([]);
    setShowAddModal(true);
    fetchAllUsers();
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setAddModalGroup(null);
    setSelectedToAdd([]);
  };

  const handleToggleUser = (user) => {
    if (selectedToAdd.some(u => u.email === user.email)) {
      setSelectedToAdd(selectedToAdd.filter(u => u.email !== user.email));
    } else {
      setSelectedToAdd([...selectedToAdd, user]);
    }
  };

  // Unified group action handler
  const handleGroupAction = async (groupId, action, payload = {}) => {
    try {
      const response = await fetch(`http://localhost:3001/api/groups/${groupId}/member`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      if (response.ok && ref && typeof ref.current?.refreshGroups === 'function') {
        ref.current.refreshGroups();
      }
    } catch (error) {}
  };

  const handleAcceptGroup = (groupId) => {
    handleGroupAction(groupId, 'accept', { targetEmail: currentUserEmail, actorEmail: currentUserEmail });
  };
  const handleDeclineGroup = (groupId) => {
    handleGroupAction(groupId, 'decline', { targetEmail: currentUserEmail, actorEmail: currentUserEmail });
  };
  const handleRemoveMember = (groupId, memberEmail) => {
    handleGroupAction(groupId, 'remove', { targetEmail: memberEmail, actorEmail: currentUserEmail });
  };
  const handleAddMembers = () => {
    if (!addModalGroup || selectedToAdd.length === 0) return;
    handleGroupAction(addModalGroup._id, 'add', { actorEmail: currentUserEmail, newMembers: selectedToAdd.map(u => u.email) });
    closeAddModal();
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      const response = await fetch(`http://localhost:3001/api/groups/${groupId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ creatorEmail: currentUserEmail })
      });
      if (response.ok) fetchUserGroups();
    } catch (error) {
      console.error('Error deleting group:', error);
    }
  };

  const getMemberStatus = (group, memberEmail) => {
    const member = group.members.find(m => m.email === memberEmail);
    return member ? member.status : 'unknown';
  };

  const isGroupCreator = (group) => group.createdBy === currentUserEmail;
  const isPendingMember = (group) => getMemberStatus(group, currentUserEmail) === 'pending';

  if (loading) {
    return (
      <div className="popover-header">
        <h3>My Groups</h3>
        <div className="loading">Loading groups...</div>
      </div>
    );
  }

  return (
    <div className="popover-container">
      <div className="popover-header">
        <h3>My Groups</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      <div className="popover-body">
        {userGroups.length === 0 ? (
          <div className="empty-state">
            <p>No groups available</p>
            <p>Create a new group to get started</p>
          </div>
        ) : (
          <div className="">
            {userGroups.map((group) => {
              const expanded = expandedGroupId === group._id;
              const acceptedCount = group.members.filter(m => m.status === 'accepted').length;
              const pendingCount = group.members.filter(m => m.status === 'pending').length;
              return (
                <div key={group._id} className={`group-item${expanded ? ' expanded' : ''}`}> 
                  <div className="group-summary" onClick={() => setExpandedGroupId(expanded ? null : group._id)}>
                    <div className="group-info">
                      <span className="group-name">{group.name}
                        {isGroupCreator(group) && (
                          <button
                            className="add-member-btn"
                            title="Add members"
                            onClick={e => { e.stopPropagation(); openAddModal(group); }}
                          >
                            <span style={{fontSize:'1.2em',fontWeight:600}}>＋</span>
                          </button>
                        )}
                      </span>
                      <span className="group-members">
                        <span title="Accepted">✅ {acceptedCount}</span>
                        <span title="Pending" style={{marginLeft:8}}>⏳ {pendingCount}</span>
                        <span style={{marginLeft:8}}>👥 {group.members.length}</span>
                      </span>
                    </div>
                    <span className="expand-arrow">{expanded ? '▲' : '▼'}</span>
                  </div>
                  {expanded && (
                    <div className="group-details">
                      <div className="group-members-list">
                        {group.members.map((member) => (
                          <div key={member.email} className="member-item">
                            <div className="member-info">
                              <span className="member-email">{member.email}</span>
                              {member.email === group.createdBy ? (
                                <span className="group-member-status creator">👑 Creator</span>
                              ) : (
                                <span className={`group-member-status ${member.status}`}>
                                  {member.status === 'pending' ? '⏳ Pending' : '✅ Accepted'}
                                </span>
                              )}
                            </div>
                            {isGroupCreator(group) && member.email !== currentUserEmail && (
                              <button 
                                className="remove-member-button"
                                onClick={() => handleRemoveMember(group._id, member.email)}
                                title="Remove member"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="group-actions button-row">
                        {isGroupCreator(group) && (
                          <>
                            <button 
                              className="start-call-button"
                              onClick={() => onAction('start-group-call', group)}
                            >
                              Start Call
                            </button>
                            <button 
                              className="delete-group-button"
                              onClick={() => handleDeleteGroup(group._id)}
                            >
                              Delete Group
                            </button>
                          </>
                        )}
                        {!isGroupCreator(group) && isPendingMember(group) && (
                          <>
                            <button 
                              className="accept-button"
                              onClick={() => handleAcceptGroup(group._id)}
                            >
                              Accept
                            </button>
                            <button 
                              className="decline-button"
                              onClick={() => handleDeclineGroup(group._id)}
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="popover-footer">
        <button className="cancel-button" onClick={onClose}>Close</button>
      </div>
      {/* Add Members Modal */}
      {showAddModal && (
        <div className="add-members-modal-overlay" onClick={closeAddModal}>
          <div className="add-members-modal" onClick={e => e.stopPropagation()}>
            <div className="add-members-header">
              <h4>Add Members to {addModalGroup?.name}</h4>
              <button className="close-button" onClick={closeAddModal}>×</button>
            </div>
            <div className="add-members-list">
              {allUsers.map(user => {
                const alreadyInGroup = addModalGroup.members.some(m => m.email === user.email);
                return (
                  <label key={user.email} className={`add-member-item${alreadyInGroup ? ' disabled' : ''}`}>
                    <input
                      type="checkbox"
                      checked={alreadyInGroup || selectedToAdd.some(u => u.email === user.email)}
                      disabled={alreadyInGroup}
                      onChange={() => handleToggleUser(user)}
                    />
                    <span className="add-member-email">{user.email}</span>
                    {alreadyInGroup && <span className="already-in-group">(Already in group)</span>}
                  </label>
                );
              })}
            </div>
            <div className="add-members-actions">
              <button className="cancel-button" onClick={closeAddModal}>Cancel</button>
              <button className="action-button" onClick={handleAddMembers} disabled={selectedToAdd.length === 0}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default GroupsListPopover; 