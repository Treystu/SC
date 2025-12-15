/**
 * QR Code Share Component
 * Generates QR codes for sharing invite links
 */

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import type { PendingInvite } from "@sc/core";
import { WebShareAPI } from "../utils/webShareAPI";
import { LocalNetworkServer } from "../utils/localNetworkServer";
import "./QRCodeShare.css";

interface QRCodeShareProps {
  invite: PendingInvite;
  onClose: () => void;
  embedded?: boolean;
}

export const QRCodeShare: React.FC<QRCodeShareProps> = ({
  invite,
  onClose,
  embedded = false,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string>("");
  const [localUrls, setLocalUrls] = useState<string[]>([]);
  const [showLocalNetwork, setShowLocalNetwork] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string>("");
  const [sharingLocal, setSharingLocal] = useState(false);

  const webShare = new WebShareAPI();
  const localServer = new LocalNetworkServer();

  // Generate QR code on mount
  useEffect(() => {
    generateQR();
  }, [invite]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sharingLocal) {
        localServer.stopSharing();
      }
    };
  }, [sharingLocal]);

  const generateQR = async () => {
    // Use query parameters for Android deep link compatibility
    const inviterParam = invite.inviterName
      ? `&inviter=${encodeURIComponent(invite.inviterName)}`
      : "";
    const url = `${window.location.origin}/join?code=${encodeURIComponent(invite.code)}${inviterParam}`;
    setShareUrl(url);

    try {
      // Generate QR code with high error correction
      const qr = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: 512,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });

      setQrDataUrl(qr);
    } catch (error) {
      console.error("Failed to generate QR code:", error);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyFeedback("Copied!");
      setTimeout(() => setCopyFeedback(""), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      setCopyFeedback("Failed to copy");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const handleWebShare = async () => {
    const result = await webShare.share(invite);

    if (result.success) {
      if (result.method === "clipboard") {
        setCopyFeedback("Link copied to clipboard!");
        setTimeout(() => setCopyFeedback(""), 2000);
      }
    } else {
      setCopyFeedback("Sharing cancelled");
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const handleLocalNetworkShare = async () => {
    setSharingLocal(true);
    setShowLocalNetwork(true);

    try {
      const shareInfo = await localServer.startSharing(invite);
      setLocalUrls(shareInfo.urls);
    } catch (error) {
      console.error("Failed to start local network sharing:", error);
      setCopyFeedback("Failed to start local sharing");
      setSharingLocal(false);
      setTimeout(() => setCopyFeedback(""), 2000);
    }
  };

  const handleStopLocalSharing = async () => {
    await localServer.stopSharing();
    setSharingLocal(false);
    setShowLocalNetwork(false);
    setLocalUrls([]);
  };

  const downloadQR = () => {
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `sc-invite-${invite.code.substring(0, 8)}.png`;
    link.click();
  };

  const content = (
    <div className="qr-share-container">
      {!embedded && <h2>Share SC App</h2>}

      {/* QR Code Display */}
      {qrDataUrl && (
        <div className="qr-code-section">
          <img
            src={qrDataUrl}
            alt="QR Code for invite"
            className="qr-code-image"
          />
          <p className="qr-instruction">Scan with camera to join</p>
        </div>
      )}

      {/* Share URL */}
      <div className="share-url-section">
        <input
          type="text"
          value={shareUrl}
          readOnly
          className="share-url-input"
          aria-label="Invite link"
        />
        <button
          onClick={handleCopy}
          className="copy-btn"
          aria-label="Copy invite link"
        >
          📋 Copy
        </button>
      </div>

      {copyFeedback && (
        <div className="copy-feedback" role="status" aria-live="polite">
          {copyFeedback}
        </div>
      )}

      {/* Share Options */}
      <div className="share-options">
        <h3>Share via:</h3>

        <div className="share-buttons">
          {WebShareAPI.isAvailable() && (
            <button onClick={handleWebShare} className="share-btn share-native">
              📤 Share
            </button>
          )}

          <button onClick={downloadQR} className="share-btn share-download">
            💾 Download QR
          </button>

          {!sharingLocal ? (
            <button
              onClick={handleLocalNetworkShare}
              className="share-btn share-local"
            >
              🌐 Share on Local Network
            </button>
          ) : (
            <button
              onClick={handleStopLocalSharing}
              className="share-btn share-local-stop"
            >
              🛑 Stop Local Sharing
            </button>
          )}
        </div>
      </div>

      {/* Local Network URLs */}
      {showLocalNetwork && localUrls.length > 0 && (
        <div className="local-network-section">
          <h3>Local Network URLs:</h3>
          <div className="local-urls">
            {localUrls.map((url, index) => (
              <div key={index} className="local-url-item">
                <code>{url}</code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(url);
                    setCopyFeedback("Copied!");
                    setTimeout(() => setCopyFeedback(""), 2000);
                  }}
                  className="copy-btn-small"
                  aria-label={`Copy URL ${url}`}
                >
                  📋
                </button>
              </div>
            ))}
          </div>
          <p className="local-network-note">
            Other devices on the same network can use these URLs to install the
            app and join.
          </p>
        </div>
      )}

      {/* Invite Info */}
      <div className="invite-info">
        <p>
          <strong>Inviter:</strong> {invite.inviterName || "You"}
        </p>
        <p>
          <strong>Expires:</strong>{" "}
          {new Date(invite.expiresAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content qr-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close sharing modal"
        >
          ×
        </button>

        {content}
      </div>
    </div>
  );
};
