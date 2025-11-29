import { useState, useEffect, useRef } from 'react';

import './sentry';
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
import { parseConnectionOffer, hexToBytes } from '@sc/core';
import { ProfileManager, UserProfile } from './managers/ProfileManager';
import { validateMessageContent } from '@sc/core';
import { rateLimiter } from '../../core/src/rate-limiter';
import { config } from './config';

function App() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { status, peers, messages, sendMessage, connectToPeer, generateConnectionOffer, acceptConnectionOffer, identity, joinRoom, joinRelay } = useMeshNetwork();
  const { contacts, addContact, loading: contactsLoading } = useContacts();
  const autoJoinedRef = useRef(false);

  const { invite, createInvite, clearInvite } = useInvite(
    status.localPeerId,
    identity?.publicKey || null,
    identity?.privateKey || null,
    userProfile?.displayName || 'User'
  );

  // Check for pending invite from join.html page
  const pendingInvite = usePendingInvite();

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'n', ctrl: true, description: 'New Conversation', action: () => document.querySelector<HTMLElement>('.add-contact-btn')?.click() },
    { key: 'k', ctrl: true, description: 'Search', action: () => document.querySelector<HTMLElement>('.search-input')?.focus() },
    { key: 's', ctrl: true, description: 'Settings', action: () => setShowSettings(true) },
    { key: 'Escape', description: 'Close Modals', action: () => { setShowSettings(false); setShowDiagnostics(false); setShowShareApp(false); } }
  ]);

  // Check if onboarding has been completed
  useEffect(() => {
    const onboardingComplete = localStorage.getItem('sc-onboarding-complete');
    if (!onboardingComplete) {
      setShowOnboarding(true);
    }

    const profileManager = new ProfileManager();
    profileManager.getProfile().then(setUserProfile);
  }, []);

  // Auto-join public hub if configured
  useEffect(() => {
    if (status.isConnected && config.publicHub && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      console.log(`Auto-joining public hub in ${config.deploymentMode} mode...`);

      if (config.deploymentMode === 'netlify') {
        joinRoom(config.relayUrl).catch(err => console.error('Failed to auto-join Netlify room:', err));
      } else if (config.deploymentMode === 'server') {
        joinRelay(config.relayUrl).catch(err => console.error('Failed to auto-join Relay server:', err));
      }
    }
  }, [status.isConnected, joinRoom, joinRelay]);

  // Handle pending invite from join.html page
  useEffect(() => {
    if (pendingInvite.code && identity?.publicKey && identity?.privateKey) {
      // Process the pending invite
      const processPendingInvite = async () => {
        try {
          // Import InviteManager from core
          const { InviteManager } = await import('@sc/core');
          const inviteManager = new InviteManager(
            status.localPeerId,
            identity.publicKey,
            identity.privateKey,
            userProfile?.displayName || 'User'
          );

          // Redeem the invite (code is guaranteed to be non-null by the outer if check)
          const inviteCode = pendingInvite.code;
          if (!inviteCode) return;

          const result = await inviteManager.redeemInvite(
            inviteCode,
            status.localPeerId
          );

          if (result.success) {
            // Convert publicKey Uint8Array to base64 string for storage
            // Use Array.from to avoid stack overflow with large arrays
            const publicKeyArray = Array.from(result.contact.publicKey);
            const publicKeyBase64 = btoa(String.fromCharCode.apply(null, publicKeyArray as any));

            // Use first 16 characters as fingerprint for display
            const FINGERPRINT_LENGTH = 16;

            // Save contact to database
            const db = getDatabase();
            await db.saveContact({
              id: result.contact.peerId,
              publicKey: publicKeyBase64,
              displayName: result.contact.name || pendingInvite.inviterName || 'New Contact',
              lastSeen: Date.now(),
              createdAt: Date.now(),
              fingerprint: publicKeyBase64.substring(0, FINGERPRINT_LENGTH),
              verified: true,
              blocked: false,
              endpoints: [],
            });

            // Connect to the inviter
            await connectToPeer(result.contact.peerId);
            setSelectedConversation(result.contact.peerId);

            announce.message(
              `Joined from invite! Connected to ${result.contact.name || pendingInvite.inviterName || 'your friend'}`,
              'assertive'
            );
          }
        } catch (error) {
          console.error('Failed to process pending invite:', error);
          announce.message(
            'Failed to process invite. The invite may be invalid or expired.',
            'assertive'
          );
        }
      };

      processPendingInvite();
    }
  }, [pendingInvite.code, identity, status.localPeerId, connectToPeer]);

  // Announce connection status changes to screen readers
  useEffect(() => {
    if (status.isConnected) {
      announce.message(`Connected to ${status.peerCount} peer${status.peerCount === 1 ? '' : 's'}`, 'polite');
    } else {
      announce.message('Disconnected from network', 'polite');
    }
  }, [status.isConnected, status.peerCount]);

  const handleAddContact = async (peerId: string, name: string, publicKeyHex?: string) => {
    let finalPublicKeyHex = publicKeyHex;

    // If no public key provided, try to use peerId if it looks like a key, or generate a dummy one for testing
    if (!finalPublicKeyHex) {
      if (isValidPublicKey(peerId)) {
        finalPublicKeyHex = peerId;
      } else {
        // Generate a random public key for testing/demo purposes if one isn't provided
        // This allows adding "test-buddy" or other simple names
        console.warn('Generating dummy public key for contact:', name);
        const keyPair = await window.crypto.subtle.generateKey(
          {
            name: 'Ed25519',
            namedCurve: 'Ed25519'
          } as any,
          true,
          ['sign', 'verify']
        );
        const exported = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
        finalPublicKeyHex = Array.from(new Uint8Array(exported))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      }
    }

    if (!finalPublicKeyHex || !isValidPublicKey(finalPublicKeyHex)) {
      console.error('Invalid public key:', finalPublicKeyHex);
      throw new Error('Valid public key required for contact');
    }

    const publicKeyBytes = hexToBytes(finalPublicKeyHex);
    const publicKeyBase64 = publicKeyToBase64(publicKeyBytes);
    const fingerprint = await generateFingerprint(publicKeyBytes);

    await addContact({
      id: peerId,
      publicKey: publicKeyBase64, // ACTUAL PUBLIC KEY
      displayName: name,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      fingerprint: fingerprint, // ACTUAL FINGERPRINT
      verified: false, // Verify through key exchange
      blocked: false,
      endpoints: [{ type: 'webrtc' }]
    });

    // Create a conversation for the new contact
    const db = getDatabase();
    await db.saveConversation({
      id: peerId,
      contactId: peerId,
      lastMessageTimestamp: Date.now(),
      unreadCount: 0,
      createdAt: Date.now(),
    });
  };

  const handleImportContact = async (code: string, name: string) => {
    try {
      const offer = parseConnectionOffer(code) as { publicKey?: string };

      if (!offer || !offer.publicKey || !isValidPublicKey(offer.publicKey)) {
        throw new Error('Invalid connection offer - missing public key');
      }

      const publicKeyBytes = hexToBytes(offer.publicKey);
      const publicKeyBase64 = publicKeyToBase64(publicKeyBytes);
      const fingerprint = await generateFingerprint(publicKeyBytes);

      const remotePeerId = await acceptConnectionOffer(code);

      await addContact({
        id: remotePeerId,
        publicKey: publicKeyBase64, // ACTUAL PUBLIC KEY FROM OFFER
        displayName: name,
        lastSeen: Date.now(),
        createdAt: Date.now(),
        fingerprint: fingerprint, // ACTUAL FINGERPRINT
        verified: true, // Verified through key exchange
        blocked: false,
        endpoints: [{ type: 'webrtc' }]
      });

      setSelectedConversation(remotePeerId);
      announce.message(`Connected to ${name}`, 'polite');
    } catch (error) {
      console.error('Failed to connect to peer from offer:', error);
      announce.message(`Failed to connect to ${name}`, 'assertive');
    }
  };

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    const validation = validateMessageContent(content);
    if (!validation.valid) {
      console.error('Message validation failed:', validation.error);
      alert(validation.error);
      return;
    }

    const rateLimitResult = rateLimiter.canSendMessage(status.localPeerId);
    if (!rateLimitResult.allowed) {
      console.error('Rate limit exceeded:', rateLimitResult.reason);
      alert(rateLimitResult.reason);
      return;
    }

    if (attachments && attachments.length > 0) {
      const fileRateLimitResult = rateLimiter.canSendFile(status.localPeerId);
      if (!fileRateLimitResult.allowed) {
        console.error('File rate limit exceeded:', fileRateLimitResult.reason);
        alert(fileRateLimitResult.reason);
        return;
      }
    }

    const sanitizedContent = validation.sanitized;

    if (selectedConversation) {
      try {
        await sendMessage(selectedConversation, sanitizedContent, attachments);
      } catch (error) {
        console.error('Error sending message via hook:', error);
      }

      // Save message to IndexedDB
      try {
        const db = getDatabase();
        // Save text message if present
        if (sanitizedContent) {
          await db.saveMessage({
            id: `msg-${Date.now()}`,
            conversationId: selectedConversation,
            content: sanitizedContent,
            timestamp: Date.now(),
            senderId: status.localPeerId,
            recipientId: selectedConversation,
            type: 'text',
            status: 'sent'
          });
        }

        // Save file messages if present
        if (attachments && attachments.length > 0) {
          for (const file of attachments) {
            await db.saveMessage({
              id: `msg-file-${Date.now()}-${Math.random()}`,
              conversationId: selectedConversation,
              content: `Sent file: ${file.name}`,
              timestamp: Date.now(),
              senderId: status.localPeerId,
              recipientId: selectedConversation,
              type: 'file',
              status: 'sent',
              metadata: {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type
              }
            });
          }
        }
      } catch (dbError) {
        console.error('Failed to save message:', dbError);
      }
    } else {
      console.warn('No conversation selected');
    }
  };

  const handleShareApp = async () => {
    // Ensure keys are initialized
    if (identity?.publicKey && identity?.privateKey) {
      await createInvite();
      setShowShareApp(true);
    } else {
      console.warn('Identity not ready for sharing');
      announce.message('Please wait for identity to initialize', 'assertive');
    }
  };

  const handleCloseShareApp = () => {
    setShowShareApp(false);
    clearInvite();
  };

  return (
    <ErrorBoundary>
      {/* Initialization Error Banner */}
      {status.initializationError && (
        <div className="error-banner" role="alert">
          <div className="error-content">
            <h3>⚠️ Startup Error</h3>
            <p>{status.initializationError}</p>
            <button
              onClick={() => navigator.clipboard.writeText(status.initializationError!)}
              className="copy-error-btn"
            >
              Copy Error
            </button>
          </div>
        </div>
      )}

      {/* Onboarding Flow */}
      {showOnboarding && (
        <OnboardingFlow
          onComplete={() => setShowOnboarding(false)}
          localPeerId={status.localPeerId}
        />
      )}

      {/* Share App Modal */}
      {showShareApp && invite && (
        <QRCodeShare
          invite={invite}
          onClose={handleCloseShareApp}
        />
      )}

      {/* Network Diagnostics Modal */}
      {showDiagnostics && (
        <div className="modal-overlay" onClick={() => setShowDiagnostics(false)}>
          <div className="modal-content diagnostics-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowDiagnostics(false)}
              aria-label="Close diagnostics"
            >
              ×
            </button>
            <NetworkDiagnostics />
          </div>
        </div>
      )}

      <div className="app" role="application" aria-label="Sovereign Communications Messenger">
        {/* Skip to main content link for keyboard navigation */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="app-header" role="banner">
          <h1>Sovereign Communications</h1>
          <div className="header-controls">
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="diagnostics-btn"
              aria-label="Network Diagnostics"
              title="Network Diagnostics"
              data-testid="diagnostics-btn"
            >
              📶
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="settings-btn"
              aria-label="Settings"
              title="Settings"
              data-testid="settings-btn"
            >
              ⚙️
            </button>
            <ConnectionStatus quality={status.connectionQuality} />
          </div>
        </header>

        <div className="app-body" data-testid="app-body">
          {!showOnboarding && (
            <>
              <aside className="sidebar" role="complementary" aria-label="Conversations">
                <ErrorBoundary fallback={<div role="alert">Error loading conversations</div>}>
                  <ConversationList
                    conversations={contacts.map(c => ({
                      id: c.id,
                      name: c.displayName,
                      unreadCount: 0, // Replace with actual unread count
                    }))}
                    loading={contactsLoading}
                    selectedId={selectedConversation}
                    onSelect={setSelectedConversation}
                    onAddContact={handleAddContact}
                    onImportContact={handleImportContact}
                    onShareApp={handleShareApp}
                    localPeerId={status.localPeerId}
                    generateConnectionOffer={generateConnectionOffer}
                    onJoinRoom={joinRoom}
                    onJoinRelay={joinRelay}
                  />
                </ErrorBoundary>
              </aside>

              <main className="main-content" id="main-content" role="main" tabIndex={-1} data-testid="main-content">
                <ErrorBoundary fallback={<div role="alert">Error loading chat</div>}>
                  {selectedConversation ? (
                    <ErrorBoundary fallback={<div role="alert">Error in ChatView</div>}>
                      <ChatView
                        conversationId={selectedConversation}
                        contactName={contacts.find(c => c.id === selectedConversation)?.displayName || 'Unknown Contact'}
                        isOnline={peers.some(p => p.id === selectedConversation)}
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        isLoading={contactsLoading}
                      />
                    </ErrorBoundary>
                  ) : (
                    <div className="empty-state">
                      <h2>Welcome to Sovereign Communications</h2>
                      <p>Select a conversation or add a new contact to get started</p>
                      <div className="features" role="list">
                        <div className="feature" role="listitem">
                          <h3>🔒 End-to-End Encrypted</h3>
                          <p>All messages are encrypted with Ed25519 and ChaCha20-Poly1305</p>
                        </div>
                        <div className="feature" role="listitem">
                          <h3>🌐 Mesh Networking</h3>
                          <p>Direct peer-to-peer communication with no central servers</p>
                        </div>
                        <div className="feature" role="listitem">
                          <h3>🔗 Multi-Platform</h3>
                          <p>Works on Web, Android, and iOS with seamless connectivity</p>
                        </div>
                      </div>
                      {status.localPeerId && (
                        <div className="peer-info" role="status" aria-live="polite">
                          <p><strong>Your Peer ID:</strong> <span aria-label={`Peer ID ${status.localPeerId}`}>{status.localPeerId.substring(0, 16)}...</span></p>
                          <p><strong>Connected Peers:</strong> {status.peerCount}</p>
                        </div>
                      )}
                    </div>
                  )}
                </ErrorBoundary>
              </main>
            </>
          )}
        </div>

        {/* Settings Modal */}
        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
              <button
                className="modal-close"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ×
              </button>
              <SettingsPanel />
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;