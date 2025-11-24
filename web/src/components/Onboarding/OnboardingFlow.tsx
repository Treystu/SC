import { useState } from 'react';
import './OnboardingFlow.css';

interface OnboardingFlowProps {
  onComplete: () => void;
  localPeerId: string;
}

type OnboardingStep = 'welcome' | 'identity' | 'add-contact' | 'privacy';

export function OnboardingFlow({ onComplete, localPeerId }: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [displayName, setDisplayName] = useState('');

  const handleNext = () => {
    switch (step) {
      case 'welcome':
        setStep('identity');
        break;
      case 'identity':
        setStep('add-contact');
        break;
      case 'add-contact':
        setStep('privacy');
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
    localStorage.setItem('sc-onboarding-complete', 'true');
    onComplete();
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-container">
        {/* Progress indicator */}
        <div className="onboarding-progress" role="progressbar" aria-valuenow={getStepNumber(step)} aria-valuemin={1} aria-valuemax={4}>
          <div className={`progress-dot ${step === 'welcome' || getStepNumber(step) > 1 ? 'active' : ''}`} />
          <div className={`progress-dot ${getStepNumber(step) > 1 ? 'active' : ''}`} />
          <div className={`progress-dot ${getStepNumber(step) > 2 ? 'active' : ''}`} />
          <div className={`progress-dot ${getStepNumber(step) > 3 ? 'active' : ''}`} />
        </div>

        {/* Welcome Screen */}
        {step === 'welcome' && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🔐</div>
            <h1 id="onboarding-title">Welcome to Sovereign Communications</h1>
            <p className="onboarding-subtitle">
              Private, decentralized messaging with end-to-end encryption
            </p>
            <ul className="onboarding-features">
              <li>✅ No central servers</li>
              <li>✅ Military-grade encryption</li>
              <li>✅ Direct peer-to-peer connections</li>
              <li>✅ Your data stays on your device</li>
            </ul>
            <button onClick={handleNext} className="btn-primary onboarding-btn">
              Get Started
            </button>
            <button onClick={handleSkip} className="btn-text">
              Skip Tutorial
            </button>
          </div>
        )}

        {/* Identity Screen */}
        {step === 'identity' && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🆔</div>
            <h2 id="onboarding-title">Your Secure Identity</h2>
            <p>
              We've created a unique cryptographic identity for you. 
              This ID is how others will connect to you.
            </p>
            <div className="identity-display">
              <label htmlFor="peer-id">Your Peer ID:</label>
              <code id="peer-id" className="peer-id">{localPeerId || 'Generating...'}</code>
            </div>
            <div className="form-group">
              <label htmlFor="display-name">
                Display Name (optional):
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., Alice"
                maxLength={50}
                className="onboarding-input"
              />
              <small>This name is only stored locally on your device</small>
            </div>
            <div className="onboarding-actions">
              <button onClick={() => setStep('welcome')} className="btn-secondary">
                Back
              </button>
              <button onClick={handleNext} className="btn-primary">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Add Contact Screen */}
        {step === 'add-contact' && (
          <div className="onboarding-step">
            <div className="onboarding-icon">👥</div>
            <h2 id="onboarding-title">Connect with Others</h2>
            <p>
              To start messaging, you'll need to add contacts. There are several ways to connect:
            </p>
            <div className="connection-methods">
              <div className="method-card">
                <strong>📱 QR Code</strong>
                <p>Scan someone's QR code or show yours</p>
              </div>
              <div className="method-card">
                <strong>🔗 Manual Entry</strong>
                <p>Exchange Peer IDs directly</p>
              </div>
              <div className="method-card">
                <strong>🧪 Demo Mode</strong>
                <p>Try it out with "demo" as the Peer ID</p>
              </div>
            </div>
            <div className="onboarding-tip">
              💡 <strong>Tip:</strong> Click the "+" button in the top-right to add your first contact
            </div>
            <div className="onboarding-actions">
              <button onClick={() => setStep('identity')} className="btn-secondary">
                Back
              </button>
              <button onClick={handleNext} className="btn-primary">
                Continue
              </button>
            </div>
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
              <button onClick={handleNext} className="btn-primary">
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
