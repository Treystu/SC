import React, { useState, useRef } from "react";
import { useMeshNetwork } from "../../hooks/useMeshNetwork";
import { QRCodeShare } from "../QRCodeShare";
import { useBackup } from "../../hooks/useBackup";
import { getDatabase } from "../../storage/database";
import "./OnboardingFlow.css";

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Step = "welcome" | "identity" | "add-contact" | "privacy";

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  onComplete,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [displayName, setDisplayName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { identity, status } = useMeshNetwork();
  const {
    restoreBackup,
    isProcessing: isRestoring,
    status: restoreStatus,
    error: restoreError,
  } = useBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [showRestorePassword, setShowRestorePassword] = useState(false);

  const handleNext = () => {
    switch (currentStep) {
      case "welcome":
        setCurrentStep("identity");
        break;
      case "identity":
        if (displayName.trim()) {
          setIsGenerating(true);
          // Simulate identity generation delay
          setTimeout(() => {
            setIsGenerating(false);
            setCurrentStep("add-contact");
          }, 1500);
        }
        break;
      case "add-contact":
        setCurrentStep("privacy");
        break;
      case "privacy":
        // Save onboarding completion flag and display name to IndexedDB
        (async () => {
          const db = getDatabase();
          await db.setSetting("onboarding-complete", true);
          if (displayName) {
            // Update the identity with the display name
            const identity = await db.getPrimaryIdentity();
            if (identity) {
              await db.saveIdentity({
                ...identity,
                displayName: displayName,
              });
            }
          }
          onComplete();
        })();
        break;
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // If we suspect encryption but have no password, ask for it first
    // For simplicity, we'll just try to restore. If it fails due to encryption, we'll show password field.
    // Ideally, we'd peek at the file, but useBackup handles the logic.

    // However, useBackup needs the password passed in.
    // Let's try to restore without password first.
    const result = await restoreBackup(file, restorePassword);

    if (result === null && restoreError?.includes("encrypted")) {
      setShowRestorePassword(true);
      // Clear error after a moment or let user see it
    } else if (result?.success) {
      // Success! Save onboarding completion to IndexedDB
      const db = getDatabase();
      await db.setSetting("onboarding-complete", true);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  };

  const handlePasswordSubmit = async () => {
    if (fileInputRef.current?.files?.[0]) {
      const result = await restoreBackup(
        fileInputRef.current.files[0],
        restorePassword,
      );
      if (result?.success) {
        const db = getDatabase();
        await db.setSetting("onboarding-complete", true);
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return (
          <div className="step welcome">
            <h1>Welcome to Sovereign</h1>
            <p className="subtitle">
              Secure, decentralized communication for everyone.
            </p>

            <div className="features">
              <div className="feature">
                <span className="icon">🔒</span>
                <h3>End-to-End Encrypted</h3>
                <p>Your messages are private and secure by default.</p>
              </div>
              <div className="feature">
                <span className="icon">🌐</span>
                <h3>Decentralized</h3>
                <p>No central server. You own your data.</p>
              </div>
              <div className="feature">
                <span className="icon">⚡</span>
                <h3>Fast & Lightweight</h3>
                <p>Works offline and on slow networks.</p>
              </div>
            </div>

            <div className="actions">
              <button className="btn btn-primary" onClick={handleNext}>
                Get Started
              </button>

              <div className="restore-section">
                <p>Already have an account?</p>
                <button
                  className="btn btn-secondary"
                  onClick={handleRestoreClick}
                  disabled={isRestoring}
                >
                  {isRestoring ? "Restoring..." : "Restore from Backup"}
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept=".json"
                  onChange={handleFileChange}
                />
              </div>

              {showRestorePassword && (
                <div className="restore-password-modal">
                  <h3>Enter Backup Password</h3>
                  <input
                    type="password"
                    value={restorePassword}
                    onChange={(e) => setRestorePassword(e.target.value)}
                    placeholder="Password"
                  />
                  <button 
                    className="btn btn-primary"
                    onClick={handlePasswordSubmit} 
                    disabled={isRestoring}
                  >
                    {isRestoring ? "Decrypting..." : "Restore"}
                  </button>
                </div>
              )}

              {(restoreStatus || restoreError) && (
                <div
                  className={`status-message ${restoreError ? "error" : "success"}`}
                >
                  {restoreError || restoreStatus}
                </div>
              )}
            </div>
          </div>
        );

      case "identity":
        return (
          <div className="step identity">
            <h2>Create Your Identity</h2>
            <p>Choose a display name. This is how others will see you.</p>

            <div className="input-group">
              <input
                type="text"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="actions">
              <button
                className="btn btn-primary"
                onClick={handleNext}
                disabled={!displayName.trim() || isGenerating}
              >
                {isGenerating ? "Generating Keys..." : "Next"}
              </button>
            </div>
          </div>
        );

      case "add-contact":
        return (
          <div className="step add-contact">
            <h2>Add Your First Contact</h2>
            <p>Scan a QR code or share your invite link to connect.</p>

            <div className="qr-container">
              {identity && status.localPeerId && (
                <QRCodeShare
                  invite={{
                    code: status.localPeerId, // Just the ID, QRCodeShare adds the URL structure
                    inviterName: displayName,
                    inviterPeerId: status.localPeerId,
                    inviterPublicKey: identity.publicKey,
                    createdAt: Date.now(),
                    expiresAt: Date.now() + 86400000, // 24 hours
                    signature: new Uint8Array(0), // Dummy signature for demo
                    bootstrapPeers: [],
                  }}
                  onClose={handleNext}
                  embedded={true}
                />
              )}
            </div>

            <div className="actions">
              <button className="btn btn-primary" onClick={handleNext}>
                Next
              </button>
            </div>
          </div>
        );

      case "privacy":
        return (
          <div className="step privacy">
            <h2>Your Privacy & Security</h2>

            <div className="privacy-features">
              <div className="privacy-item">
                <span className="icon">🔐</span>
                <div className="text">
                  <h3>End-to-End Encryption</h3>
                  <p>
                    All messages are encrypted with Ed25519 signatures and
                    XChaCha20-Poly1305 encryption.
                  </p>
                </div>
              </div>

              <div className="privacy-item">
                <span className="icon">💾</span>
                <div className="text">
                  <h3>Local Storage</h3>
                  <p>
                    Your data lives on your device. We don't have servers to
                    store your messages.
                  </p>
                </div>
              </div>
            </div>

            <div className="actions">
              <button className="btn btn-primary" onClick={handleNext}>
                Start Messaging
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(getStepNumber(currentStep) / 4) * 100}%` }}
          />
        </div>
        {renderStep()}
      </div>
    </div>
  );
};

function getStepNumber(step: Step): number {
  switch (step) {
    case "welcome":
      return 1;
    case "identity":
      return 2;
    case "add-contact":
      return 3;
    case "privacy":
      return 4;
  }
}
