import { useState } from "react";
import "./AddContactDialog.css";
import { QRCodeScanner } from "./QRCodeScanner";
import { useErrorToast } from "./Toast/Toast";
import { decodePairingData } from "@sc/core";

interface AddContactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (peerId: string, name: string) => void;
}

export function AddContactDialog({
  isOpen,
  onClose,
  onAdd,
}: AddContactDialogProps) {
  const [peerId, setPeerId] = useState("");
  const [name, setName] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const showError = useErrorToast();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (peerId.trim()) {
      onAdd(
        peerId.trim(),
        name.trim() || `Peer ${peerId.trim().substring(0, 6)}`,
      );
      setPeerId("");
      setName("");
      onClose();
    }
  };

  const handleScan = (data: string) => {
    console.log("Scanned data:", data);
    setIsScanning(false);

    let scannedId = "";
    let scannedName = "";

    // Check for Deep Link URL
    if (data.includes("join?code=")) {
      const match = data.match(/code=([^&]+)/);
      if (match && match[1]) {
        scannedId = decodeURIComponent(match[1]);
      }
    } else {
      // Try parsing pairing data
      try {
        const pairingData = decodePairingData(data);
        if (pairingData && pairingData.peerId) {
          scannedId = pairingData.peerId;
          if (pairingData.name) scannedName = pairingData.name;
        } else {
          // Fallback to raw string
          scannedId = data;
        }
      } catch (e) {
        scannedId = data;
      }
    }

    if (scannedId) {
      // Auto-submit if we found an ID
      const finalName =
        scannedName || name.trim() || `Peer ${scannedId.substring(0, 6)}`;
      onAdd(scannedId, finalName);
      onClose();
    } else {
      showError("Could not detect a valid Peer ID in QR code.");
    }
  };

  if (isScanning) {
    return (
      <QRCodeScanner onScan={handleScan} onClose={() => setIsScanning(false)} />
    );
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>Add Contact</h3>
          <button className="dialog-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-form">
          <div className="form-group">
            <label htmlFor="contact-name">Contact Name</label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a name (optional)"
              autoFocus
              data-testid="contact-name-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="peer-id">Peer ID</label>
            <div className="input-with-action">
              <input
                id="peer-id"
                type="text"
                value={peerId}
                onChange={(e) => setPeerId(e.target.value)}
                placeholder="Enter peer ID or scan QR"
                data-testid="contact-publickey-input"
              />
              <button
                type="button"
                className="scan-btn"
                onClick={() => setIsScanning(true)}
                title="Scan QR Code"
              >
                📷
              </button>
            </div>
          </div>

          <div className="dialog-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!peerId.trim()}
              data-testid="save-contact-btn"
            >
              Add Contact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
