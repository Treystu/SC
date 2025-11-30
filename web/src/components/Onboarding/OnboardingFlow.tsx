import React, { useState, useRef } from 'react';
import { useMeshNetwork } from '../../hooks/useMeshNetwork';
import { QRCodeShare } from '../QRCodeShare';
import { useBackup } from '../../hooks/useBackup';
import './OnboardingFlow.css';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'identity' | 'add-contact' | 'privacy';

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [displayName, setDisplayName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { identity, peerId } = useMeshNetwork();
  const { restoreBackup, isProcessing: isRestoring, status: restoreStatus, error: restoreError } = useBackup();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [showRestorePassword, setShowRestorePassword] = useState(false);

  const handleNext = () => {
    switch (currentStep) {
      case 'welcome':
        setCurrentStep('identity');
        break;
      case 'identity':
        if (displayName.trim()) {
          setIsGenerating(true);
          // Simulate identity generation delay
          setTimeout(() => {
            setIsGenerating(false);
            setCurrentStep('add-contact');
          }, 1500);
        }
        break;
      case 'add-contact':
        setCurrentStep('privacy');
        break;
      case 'privacy':
        // Save onboarding completion flag
        localStorage.setItem('sc-onboarding-complete', 'true');
        if (displayName) {
          localStorage.setItem('sc-display-name', displayName);
        }
        onComplete();
        break;
    }
  };

  const handleSkip = () => {
    if (currentStep === 'add-contact') {
      setCurrentStep('privacy');
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // If we suspect encryption but have no password, ask for it first
    // For simplicity, we'll just try to restore. If it fails due to encryption, we'll show password field.
    // Ideally, we'd peek at the file, but useBackup handles the logic.
    
    // However, useBackup needs the password passed in.
    // Let's try to restore without password first.
    const result = await restoreBackup(file, restorePassword);

    if (result === null && restoreError?.includes('encrypted')) {
        setShowRestorePassword(true);
        // Clear error after a moment or let user see it
    } else if (result?.success) {
        // Success!
        localStorage.setItem('sc-onboarding-complete', 'true');
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }
  };

  const handlePasswordSubmit = async () => {
      if (fileInputRef.current?.files?.[0]) {
          const result = await restoreBackup(fileInputRef.current.files[0], restorePassword);
          if (result?.success) {
            localStorage.setItem('sc-onboarding-complete', 'true');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
          }
      }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="step welcome">
            <h1>Welcome to Sovereign</h1>
            <p className="subtitle">Secure, decentralized communication for everyone.</p>
            
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
              <button className="primary-button" onClick={handleNext}>
                Get Started
              </button>
              
              <div className="restore-section">
                <p>Already have an account?</p>
                <button className="secondary-button" onClick={handleRestoreClick} disabled={isRestoring}>
                  {isRestoring ? 'Restoring...' : 'Restore from Backup'}
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
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
                        onChange={e => setRestorePassword(e.target.value)}
                        placeholder="Password"
                      />
                      <button onClick={handlePasswordSubmit} disabled={isRestoring}>
                          {isRestoring ? 'Decrypting...' : 'Restore'}
                      </button>
                  </div>
              )}

              {(restoreStatus || restoreError) && (
                  <div className={`status-message ${restoreError ? 'error' : 'success'}`}>
                      {restoreError || restoreStatus}
                  </div>
              )}
            </div>
          </div>
        );
      
      case 'identity':
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
                        } catch (e) {
                          setConnectionStatus('error');
                        }
                      }}
                      disabled={connectionStatus === 'connecting'}
                    >
                      {connectionStatus === 'connecting' ? 'Connecting...' :
                       connectionStatus === 'connected' ? 'Connected!' :
                       connectionStatus === 'error' ? 'Failed (Try Again)' : 'Connect to Demo'}
                    </button>
                  </div>
                )}

                <button
                  className="btn-text"
                  onClick={() => {
                    setActiveMethod('none');
                    setConnectionStatus('idle');
                    setManualPeerId('');
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Privacy Screen */}
        {step === 'privacy' && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🔒</div>
            <h2 id="onboarding-title">Your Privacy & Security</h2>
            <div className="privacy-details">
              <div className="privacy-item">
                <h3>🔐 End-to-End Encryption</h3>
                <p>
                  All messages are encrypted with <strong>Ed25519</strong> signatures and{' '}
                  <strong>XChaCha20-Poly1305</strong> encryption. Even we can't read your messages.
                </p>
              </div>
              <div className="privacy-item">
                <h3>🌐 Decentralized Network</h3>
                <p>
                  Messages travel directly between devices using peer-to-peer connections.
                  No data passes through our servers because we don't have any.
                </p>
              </div>
              <div className="privacy-item">
                <h3>💾 Local Storage</h3>
                <p>
                  Your messages, contacts, and identity are stored only on your device.
                  <strong> Make sure to backup your identity keys!</strong>
                </p>
              </div>
              <div className="privacy-item">
                <h3>🔄 Perfect Forward Secrecy</h3>
                <p>
                  Session keys automatically rotate, so even if a key is compromised,
                  past messages remain secure.
                </p>
              </div>
            </div>
            <div className="onboarding-actions">
              <button onClick={() => setStep('add-contact')} className="btn-secondary">
                Back
              </button>
              <button onClick={handleNext} className="btn-primary" data-testid="start-messaging-btn">
                Start Messaging
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getStepNumber(step: OnboardingStep): number {
  switch (step) {
    case 'welcome': return 1;
    case 'identity': return 2;
    case 'add-contact': return 3;
    case 'privacy': return 4;
  }
}
