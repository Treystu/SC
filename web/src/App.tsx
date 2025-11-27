import { useState, useEffect } from 'react';
import './App.css';
import ConversationList from './components/ConversationList';
import ChatView from './components/ChatView';
import { ConnectionStatus } from './components/ConnectionStatus';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { QRCodeShare } from './components/QRCodeShare';
import { NetworkDiagnostics } from './components/NetworkDiagnostics';
import { useMeshNetwork } from './hooks/useMeshNetwork';
import { useInvite } from './hooks/useInvite';
import { usePendingInvite } from './hooks/usePendingInvite';
import { useContacts } from './hooks/useContacts';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { announce } from './utils/accessibility';
import { getDatabase } from './storage/database';
import { generateFingerprint, publicKeyToBase64, isValidPublicKey } from '@sc/core';
import { IdentityManager, parseConnectionOffer, hexToBytes } from '@sc/core';
import { ProfileManager, UserProfile } from './managers/ProfileManager';
import { validateMessageContent } from '@sc/core';
import { rateLimiter } from '../../core/src/rate-limiter';

function App() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Sovereign Communications</h1>
      <p>System Check: React is working.</p>
    </div>
  );
}

export default App;