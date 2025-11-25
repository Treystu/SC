import { useState, useEffect } from 'react';
import './SignalingDialog.css';

interface SignalingExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  localPeerId: string;
  generateOffer?: () => Promise<string>;
}

export function SignalingExportDialog({ isOpen, onClose, localPeerId, generateOffer }: SignalingExportDialogProps) {
  const [copied, setCopied] = useState(false);
  const [signalingJSON, setSignalingJSON] = useState('Generating connection info...');

  useEffect(() => {
    if (isOpen && generateOffer) {
      generateOffer()
        .then(offer => setSignalingJSON(offer))
        .catch(err => {
          console.error('Failed to generate offer:', err);
          setSignalingJSON('Error: Could not generate connection info.');
        });
    } else if (isOpen) {
      // Fallback for when generateOffer is not provided (e.g. in tests or storybook)
      setSignalingJSON(JSON.stringify({ peerId: localPeerId, error: "Offer generation not available" }, null, 2));
    }
  }, [isOpen, generateOffer, localPeerId]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(signalingJSON);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog signaling-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Share Your Connection Info</h3>
          <button className="dialog-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="dialog-body">
          <p className="signaling-instructions">
            Share this connection information with someone you want to connect with. 
            They can paste it in their "Add Contact via Code" dialog.
          </p>

          <div className="signaling-code-container">
            <pre className="signaling-code">{signalingJSON}</pre>
          </div>

          <div className="dialog-actions">
            <button onClick={handleCopy} className="btn-primary">
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </button>
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>

          <p className="signaling-note">
            💡 <strong>Tip:</strong> You can send this via email, SMS, or any messaging app. 
            Once your contact pastes this code, you'll be automatically connected!
          </p>
        </div>
      </div>
    </div>
  );
}

interface SignalingImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (code: string, name: string) => void;
}

export function SignalingImportDialog({ isOpen, onClose, onImport }: SignalingImportDialogProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const data = JSON.parse(code);
      
      if (!data.peerId) {
        setError('Invalid connection code: missing peer ID');
        return;
      }

      onImport(code, name.trim() || 'Unknown Contact');
      setCode('');
      setName('');
      setError('');
      onClose();
    } catch (err) {
      setError('Invalid connection code: must be valid JSON');
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog signaling-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Add Contact via Code</h3>
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
              placeholder="Enter a name for this contact"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="signaling-code">Connection Code</label>
            <textarea
              id="signaling-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError('');
              }}
              placeholder="Paste the connection code here..."
              rows={8}
              className="signaling-code-input"
            />
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          <div className="dialog-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={!code.trim() || !name.trim()}
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
