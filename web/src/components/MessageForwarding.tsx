import React, { useState } from 'react';

interface Message {
  id: string;
  content: string;
  timestamp: number;
  senderId: string;
}

interface Contact {
  id: string;
  name: string;
  publicKey: string;
}

interface MessageForwardingProps {
  message: Message;
  contacts: Contact[];
  onForward: (messageId: string, recipientIds: string[], comment?: string) => Promise<void>;
  onClose: () => void;
}

export const MessageForwarding: React.FC<MessageForwardingProps> = ({
  message,
  contacts,
  onForward,
  onClose
}) => {
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);

  const toggleContact = (contactId: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleForward = async () => {
    if (selectedContacts.size === 0) {
      alert('Please select at least one recipient');
      return;
    }

    setIsForwarding(true);
    try {
      await onForward(message.id, Array.from(selectedContacts), comment || undefined);
      onClose();
    } catch (error) {
      console.error('Forwarding error:', error);
      alert('Failed to forward message');
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <div className="message-forwarding-modal">
      <div className="modal-overlay" onClick={onClose}></div>
      <div className="modal-content">
        <div className="modal-header">
          <h3>Forward Message</h3>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>

        <div className="message-preview">
          <div className="preview-label">Message:</div>
          <div className="preview-content">{message.content}</div>
        </div>

        <div className="contact-selection">
          <div className="selection-header">
            Select Recipients ({selectedContacts.size} selected)
          </div>
          <div className="contact-list">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className={`contact-item ${selectedContacts.has(contact.id) ? 'selected' : ''}`}
                onClick={() => toggleContact(contact.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedContacts.has(contact.id)}
                  onChange={() => {}}
                />
                <span className="contact-name">{contact.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="comment-section">
          <label htmlFor="forward-comment">Add a comment (optional):</label>
          <textarea
            id="forward-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add context or explanation..."
            rows={3}
          />
        </div>

        <div className="modal-actions">
          <button onClick={onClose} className="cancel-btn">
            Cancel
          </button>
          <button 
            onClick={handleForward} 
            className="forward-btn"
            disabled={isForwarding || selectedContacts.size === 0}
          >
            {isForwarding ? 'Forwarding...' : `Forward to ${selectedContacts.size} contact(s)`}
          </button>
        </div>
      </div>

      <style>{`
        .message-forwarding-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
        }
        .modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
        }
        .modal-content {
          position: relative;
          max-width: 500px;
          margin: 50px auto;
          background: white;
          border-radius: 8px;
          padding: 24px;
          max-height: 80vh;
          overflow-y: auto;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
        }
        .message-preview {
          background-color: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
        }
        .preview-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 4px;
        }
        .preview-content {
          font-size: 14px;
        }
        .selection-header {
          font-weight: 600;
          margin-bottom: 12px;
        }
        .contact-list {
          max-height: 200px;
          overflow-y: auto;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .contact-item {
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          border-bottom: 1px solid #eee;
        }
        .contact-item:last-child {
          border-bottom: none;
        }
        .contact-item:hover {
          background-color: #f9f9f9;
        }
        .contact-item.selected {
          background-color: #e3f2fd;
        }
        .contact-name {
          flex: 1;
        }
        .comment-section {
          margin: 20px 0;
        }
        .comment-section label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
        }
        .comment-section textarea {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-family: inherit;
          resize: vertical;
        }
        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }
        .cancel-btn, .forward-btn {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .cancel-btn {
          background-color: #f5f5f5;
        }
        .forward-btn {
          background-color: #2196F3;
          color: white;
        }
        .forward-btn:disabled {
          background-color: #ccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};
