import React, { useEffect, useState } from "react";
import { getDatabase, StoredContact } from "../storage/database";
import "./ContactProfileDialog.css";

interface ContactProfileDialogProps {
  contactId: string;
  onClose: () => void;
  onVerify?: (id: string, verified: boolean) => void;
  onBlock?: (id: string, blocked: boolean) => void;
  onDelete?: (id: string) => void;
  onUpdate?: () => void;
}

export const ContactProfileDialog: React.FC<ContactProfileDialogProps> = ({
  contactId,
  onClose,
  onVerify,
  onBlock,
  onDelete,
  onUpdate,
}) => {
  const [contact, setContact] = useState<StoredContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    const fetchContact = async () => {
      try {
        const db = getDatabase();
        const c = await db.getContact(contactId);
        if (c) {
          setContact(c);
          setEditName(c.displayName);
        }
      } catch (err) {
        console.error("Failed to load contact details", err);
      } finally {
        setLoading(false);
      }
    };
    fetchContact();
  }, [contactId]);

  const handleSaveName = async () => {
    if (!contact || !editName.trim()) return;
    try {
      const db = getDatabase();
      const updatedContact = { ...contact, displayName: editName.trim() };
      await db.saveContact(updatedContact);
      setContact(updatedContact);
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error("Failed to save name", e);
    }
  };

  const handleToggleBlock = async () => {
    if (!contact) return;
    try {
      const db = getDatabase();
      const newBlocked = !contact.blocked;
      await db.saveContact({ ...contact, blocked: newBlocked });
      setContact({ ...contact, blocked: newBlocked });
      if (onBlock) onBlock(contact.id, newBlocked);
    } catch (e) {
      console.error("Failed to update block status", e);
    }
  };

  const handleToggleVerify = async () => {
    if (!contact) return;
    try {
      const db = getDatabase();
      const newVerified = !contact.verified;
      await db.saveContact({ ...contact, verified: newVerified });
      setContact({ ...contact, verified: newVerified });
      if (onVerify) onVerify(contact.id, newVerified);
    } catch (e) {
      console.error("Failed to update verify status", e);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this contact? This will remove chat history.",
      )
    )
      return;
    try {
      const db = getDatabase();
      await db.deleteContact(contactId);

      if (onDelete) {
        onDelete(contactId);
      }
      onClose();
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  if (loading) {
    return (
      <div className="dialog-overlay">
        <div className="dialog loading">Loading...</div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="dialog-overlay" onClick={onClose}>
        <div className="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-header">
            <h3>Contact Not Found</h3>
            <button className="dialog-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog contact-profile"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h3>Contact Info</h3>
          <button className="dialog-close btn-icon" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="profile-header">
          <div className="profile-avatar large">
            {contact.displayName.charAt(0).toUpperCase()}
          </div>
          {isEditing ? (
            <div className="edit-name-container" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', margin: '1rem 0' }}>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="edit-name-input"
                autoFocus
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              />
              <button onClick={handleSaveName} className="btn btn-primary btn-sm">Save</button>
              <button onClick={() => setIsEditing(false)} className="btn btn-secondary btn-sm">Cancel</button>
            </div>
          ) : (
            <div className="name-display" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <h2>{contact.displayName}</h2>
              <button 
                onClick={() => setIsEditing(true)} 
                className="btn-icon edit-btn"
                title="Edit Name"
                style={{ opacity: 0.7 }}
              >
                ✏️
              </button>
            </div>
          )}
          {contact.verified && (
            <span className="verified-badge">✓ Verified</span>
          )}
        </div>

        <div className="profile-details">
          <div className="detail-item">
            <label>Peer ID</label>
            <div className="code-block" title={contact.id}>
              {contact.id}
            </div>
            <button
              className="copy-small"
              onClick={() => navigator.clipboard.writeText(contact.id)}
            >
              Copy
            </button>
          </div>

          <div className="detail-item">
            <label>Fingerprint</label>
            <div className="fingerprint-display">
              {contact.fingerprint || "Generating..."}
            </div>
          </div>

          <div className="detail-item">
            <label>Status</label>
            <div>{contact.blocked ? "🚫 Blocked" : "Active"}</div>
          </div>

          <div className="detail-item">
            <label>Added</label>
            <div>{new Date(contact.createdAt || 0).toLocaleDateString()}</div>
          </div>
        </div>

        <div className="dialog-actions profile-actions">
          <button onClick={handleToggleVerify} className="btn btn-secondary">
            {contact.verified ? "Unverify" : "Mark Verified"}
          </button>
          <button
            onClick={handleToggleBlock}
            className="btn btn-secondary danger-text"
          >
            {contact.blocked ? "Unblock" : "Block"}
          </button>
          <button onClick={handleDelete} className="btn btn-danger">
            Delete Contact
          </button>
        </div>
      </div>
    </div>
  );
};
