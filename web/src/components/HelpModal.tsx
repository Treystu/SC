import React from "react";
import "./HelpModal.css";

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content help-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close btn-icon"
          onClick={onClose}
          aria-label="Close help"
        >
          ×
        </button>
        <h2>Help & FAQ</h2>

        <div className="help-section">
          <h3>💬 Groups vs. Rooms</h3>
          <p>
            <strong>Groups</strong> are private, persistent conversations with
            specific people you've invited. Use them for team chats or friends.
            They work even if some members are offline (messages queue up).
          </p>
          <p>
            <strong>Rooms</strong> (or Public Hubs) are open meeting places. Use
            them to discover new peers who are online right now. Messages in
            rooms are transient and not saved properly.
          </p>
        </div>

        <div className="help-section">
          <h3>🔑 Identity & Security</h3>
          <p>
            Your <strong>Peer ID</strong> is your unique address on the network.
            <strong>Fingerprints</strong> are short codes used to verify you are
            talking to the right person. Always verify fingerprints in person if
            possible!
          </p>
        </div>

        <div className="help-section">
          <h3>📶 Connectivity</h3>
          <p>
            This app uses a <strong>Mesh Network</strong>. If you are on the
            same Wi-Fi as a friend, messages go directly between devices. If
            apart, they may route through relays or other peers.
          </p>
        </div>

        <div className="help-section">
          <h3>emoji_objects Tips</h3>
          <ul>
            <li>
              Use <strong>Ctrl+K</strong> to search your contacts.
            </li>
            <li>Click your avatar to see your own storage stats.</li>
            <li>You can install this app as a PWA for better performance.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
