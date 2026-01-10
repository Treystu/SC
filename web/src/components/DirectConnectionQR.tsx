/**
 * Direct Connection QR Component
 * Generates QR codes for direct P2P connection offers (SDP exchange)
 * 
 * This enables instant peer-to-peer connections by scanning a QR code
 * containing the connection offer (peerId + publicKey)
 */

import React, { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { useMeshNetwork } from "../hooks/useMeshNetwork";
import "./DirectConnectionQR.css";

interface DirectConnectionQRProps {
  onClose?: () => void;
  embedded?: boolean;
}

export const DirectConnectionQR: React.FC<DirectConnectionQRProps> = ({
  onClose,
  embedded = false,
}) => {
  const {
    generateConnectionOffer,
    status,
  } = useMeshNetwork();

  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [connectionOffer, setConnectionOffer] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string>("");

  // Generate connection offer and QR code
  const generateQR = useCallback(async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const offer = await generateConnectionOffer();
      if (!offer) {
        throw new Error("Failed to generate connection offer");
      }

      setConnectionOffer(offer);

      // Create QR data with connection offer
      const qrPayload = JSON.stringify({
        type: "CONNECTION_OFFER",
        version: "1.0",
        offer: JSON.parse(offer),
        timestamp: Date.now(),
      });

      // Generate QR code
      const qr = await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 512,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      setQrDataUrl(qr);
    } catch (err) {
      console.error("Failed to generate QR code:", err);
      setError(err instanceof Error ? err.message : "Failed to generate QR code");
    } finally {
      setIsGenerating(false);
    }
  }, [generateConnectionOffer]);

  // Generate on mount - but only after mesh network is initialized
  useEffect(() => {
    if (status.isConnected && status.localPeerId) {
      console.log('[DirectConnectionQR] Mesh network ready, generating QR...');
      generateQR();
    } else {
      console.log('[DirectConnectionQR] Waiting for mesh network initialization...', {
        isConnected: status.isConnected,
        localPeerId: status.localPeerId
      });
    }
  }, [status.isConnected, status.localPeerId, generateQR]);

  // Copy offer to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(connectionOffer);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (err) {
      setCopyFeedback("Failed to copy");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  // Download QR code as image
  const handleDownload = () => {
    if (!qrDataUrl) return;

    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `sc-connection-${status.localPeerId?.substring(0, 8) || "offer"}.png`;
    link.click();
  };

  // Show loading state if mesh network not ready
  if (!status.isConnected || !status.localPeerId) {
    return (
      <div className="direct-connection-qr-container">
        {!embedded && <h2>Direct P2P Connection</h2>}
        <div className="qr-loading">
          <div className="spinner"></div>
          <p>Initializing mesh network...</p>
          {status.initializationError && (
            <p className="error-text">Error: {status.initializationError}</p>
          )}
        </div>
      </div>
    );
  }

  const content = (
    <div className="direct-connection-qr-container">
      {!embedded && <h2>Direct P2P Connection</h2>}

      {/* Peer Info */}
      <div className="peer-info">
        <p>
          <strong>Your Peer ID:</strong>{" "}
          <code>{status.localPeerId}</code>
        </p>
        <p className="peer-info-hint">
          Share this QR code to enable direct peer-to-peer connection
        </p>
      </div>

      {/* QR Code Display */}
      {isGenerating ? (
        <div className="qr-loading">
          <div className="spinner"></div>
          <p>Generating connection offer...</p>
        </div>
      ) : error ? (
        <div className="qr-error">
          <p>❌ {error}</p>
          <button onClick={generateQR} className="retry-btn">
            Try Again
          </button>
        </div>
      ) : qrDataUrl ? (
        <div className="qr-code-section">
          <img
            src={qrDataUrl}
            alt="Direct connection QR code"
            className="qr-code-image"
          />
          <p className="qr-instruction">Scan to connect instantly</p>
        </div>
      ) : null}

      {/* Connection Offer JSON */}
      {connectionOffer && (
        <div className="offer-section">
          <h3>Connection Offer</h3>
          <div className="offer-json-container">
            <textarea
              value={connectionOffer}
              readOnly
              className="offer-json"
              aria-label="Connection offer JSON"
            />
          </div>
          <div className="offer-actions">
            <button onClick={handleCopy} className="copy-btn">
              {copyFeedback || "📋 Copy Offer"}
            </button>
            <button onClick={handleDownload} className="download-btn">
              💾 Download QR
            </button>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="how-it-works">
        <h3>How it works</h3>
        <ol>
          <li>Show this QR code to the person you want to connect with</li>
          <li>They scan it using their SC app</li>
          <li>A secure P2P connection is established automatically</li>
          <li>You can now exchange encrypted messages directly</li>
        </ol>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content direct-connection-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close direct connection"
        >
          ×
        </button>

        {content}
      </div>
    </div>
  );
};

export default DirectConnectionQR;
