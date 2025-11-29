import React from 'react';
import './InviteAcceptanceModal.css';

interface InviteAcceptanceModalProps {
  inviterName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const InviteAcceptanceModal: React.FC<InviteAcceptanceModalProps> = ({
  inviterName,
  onAccept,
  onDecline,
}) => {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <div className="modal-content invite-modal">
        <h2 id="invite-modal-title">New Invitation</h2>
        
        <div className="invite-content">
          <div className="invite-icon">👋</div>
          <p className="invite-message">
            <strong>{inviterName}</strong> wants to connect with you on Sovereign Communications.
          </p>
          <p className="invite-subtext">
            Accepting will add them to your contacts and allow you to message securely.
          </p>
        </div>

        <div className="modal-actions">
          <button 
            onClick={onDecline} 
            className="btn-secondary"
            aria-label="Decline invitation"
          >
            Decline
          </button>
          <button 
            onClick={onAccept} 
            className="btn-primary"
            aria-label="Accept invitation"
            autoFocus
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};