import { useState } from 'react';
import './AddContactDialog.css';

interface AddContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (peerId: string, name: string) => void;
}

export function AddContactDialog({ isOpen, onClose, onAdd }: AddContactDialogProps) {
  const [peerId, setPeerId] = useState('');
  const [name, setName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (peerId.trim() && name.trim()) {
      onAdd(peerId.trim(), name.trim());
      setPeerId('');
      setName('');
      onClose();
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Add Contact</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-group">
            <label htmlFor="contact-name">Contact Name</label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name"
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="peer-id">Peer ID</label>
            <input
              id="peer-id"
              type="text"
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              placeholder="Enter peer ID or use 'demo' for testing"
            />
          </div>

          <div className="dialog-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!peerId.trim() || !name.trim()}>
              Add Contact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
