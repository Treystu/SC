import { useState, useEffect } from 'react';
import * as Sentry from '@sentry/react';
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
import { IdentityManager, parseConnectionOffer, hexToBytes } from '@sc/core';
import { ProfileManager, UserProfile } from './managers/ProfileManager';
import { validateMessageContent } from '@sc/core';
import { rateLimiter } from '../../core/src/rate-limiter';

function App() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [demoMessages, setDemoMessages] = useState<Array<{ id: string; from: string; content: string; timestamp: number }>>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const { status, messages, sendMessage, connectToPeer, generateConnectionOffer, acceptConnectionOffer } = useMeshNetwork();
  const { contacts, addContact, loading: contactsLoading } = useContacts();

  // Get identity keys for invite creation
  // TODO: Replace with actual identity management
  const [identityKeys, setIdentityKeys] = useState<{
    publicKey: Uint8Array | null;
    privateKey: Uint8Array | null;
  }>({ publicKey: null, privateKey: null });

  const { invite, createInvite, clearInvite } = useInvite(
    status.localPeerId,
    identityKeys.publicKey,
    identityKeys.privateKey,
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

    // Initialize identity keys
    const initKeys = async () => {
      try {
        const { generateIdentity } = await import('@sc/core');
        // Check if keys exist in storage
        const storedKeys = localStorage.getItem('sc_identity_keys');
        if (storedKeys) {
          const parsed = JSON.parse(storedKeys);
          setIdentityKeys({
            publicKey: new Uint8Array(Object.values(parsed.publicKey)),
            privateKey: new Uint8Array(Object.values(parsed.privateKey))
          });
        } else {
          const identity = generateIdentity();
          setIdentityKeys({
            publicKey: identity.publicKey,
            privateKey: identity.privateKey,
          });
          localStorage.setItem('sc_identity_keys', JSON.stringify({
            publicKey: Array.from(identity.publicKey),
            privateKey: Array.from(identity.privateKey)
          }));
        }
      } catch (e) {
        console.error("Failed to initialize identity", e);
      }
    };

    if (!identityKeys.publicKey && !identityKeys.privateKey) {
      initKeys();
    }

    const profileManager = new ProfileManager();
    profileManager.getProfile().then(setUserProfile);
  }, [identityKeys]);

  // Handle pending invite from join.html page
  useEffect(() => {
    if (pendingInvite.code && identityKeys.publicKey && identityKeys.privateKey) {
      // Process the pending invite
      const processPendingInvite = async () => {
        try {
          // Import InviteManager from core
          const { InviteManager } = await import('@sc/core');
          const inviteManager = new InviteManager(
            status.localPeerId,
            identityKeys.publicKey!,
            identityKeys.privateKey!,
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
  }, [pendingInvite.code, identityKeys.publicKey, identityKeys.privateKey, status.localPeerId, connectToPeer]);

  // Announce connection status changes to screen readers
  useEffect(() => {
    if (status.isConnected) {
      announce.message(`Connected to ${status.peerCount} peer${status.peerCount === 1 ? '' : 's'}`, 'polite');
    } else {
      announce.message('Disconnected from network', 'polite');
    }
  }, [status.isConnected, status.peerCount]);

  const handleAddContact = async (peerId: string, name: string, publicKeyHex?: string) => {
    if (!publicKeyHex || !isValidPublicKey(publicKeyHex)) {
      throw new Error('Valid public key required for contact');
    }

    const publicKeyBytes = hexToBytes(publicKeyHex);
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
  };

  const handleImportContact = async (code: string, name: string) => {
    try {
      const offer = parseConnectionOffer(code);

      if (!offer.publicKey || !isValidPublicKey(offer.publicKey)) {
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
      alert(validation.error);
      return;
    }

    const rateLimitResult = rateLimiter.canSendMessage(status.localPeerId);
    if (!rateLimitResult.allowed) {
      alert(rateLimitResult.reason);
      return;
    }

    if (attachments && attachments.length > 0) {
      const fileRateLimitResult = rateLimiter.canSendFile(status.localPeerId);
      if (!fileRateLimitResult.allowed) {
        alert(fileRateLimitResult.reason);
        return;
      }
    }

    const sanitizedContent = validation.sanitized;

    if (selectedConversation === 'demo') {
      // Handle attachments in demo mode
      if (attachments && attachments.length > 0) {
        for (const file of attachments) {
          const fileMsg = {
            id: `me-file-${Date.now()}-${Math.random()}`,
            from: 'me',
            content: `Sent file: ${file.name}`,
            timestamp: Date.now(),
            type: 'file',
            status: 'sent'
          };
          setDemoMessages(prev => [...prev, fileMsg]);

          // Echo back file receipt
          setTimeout(() => {
            setDemoMessages(prev => [...prev, {
              id: `demo-file-${Date.now()}-${Math.random()}`,
              from: 'demo',
              content: `Received file: ${file.name}`,
              timestamp: Date.now(),
              type: 'text',
              status: 'read'
            }]);
          }, 1000);
        }
      }

      if (sanitizedContent) {
        // Add user message
        const userMsg = {
          id: `me-${Date.now()}`,
          from: 'me',
          content: sanitizedContent,
          timestamp: Date.now(),
          type: 'text',
          status: 'sent'
        };
        setDemoMessages(prev => [...prev, userMsg]);

        // Echo back after delay
        setTimeout(() => {
          setDemoMessages(prev => [...prev, {
            id: `demo-${Date.now()}`,
            from: 'demo',
            content: `Echo: ${sanitizedContent}`,
            timestamp: Date.now(),
            type: 'text',
            status: 'read'
          }]);
        }, 1000);
      }
    } else if (selectedConversation) {
      sendMessage(selectedConversation, sanitizedContent, attachments);

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
        console.log('Message saved to IndexedDB');
      } catch (dbError) {
        console.error('Failed to save message:', dbError);
      }
    }
  };

  const handleShareApp = async () => {
    // Ensure keys are initialized
    if (!identityKeys.publicKey || !identityKeys.privateKey) {
      // Import crypto functions to generate keys
      const { generateIdentity } = await import('@sc/core');
      const identity = generateIdentity();
      setIdentityKeys({
        publicKey: identity.publicKey,
        privateKey: identity.privateKey,
      });

      // Wait for keys to be set before creating invite
      setTimeout(async () => {
        await createInvite();
        setShowShareApp(true);
      }, 100);
    } else {
      await createInvite();
      setShowShareApp(true);
    }
  };

  const handleCloseShareApp = () => {
    setShowShareApp(false);
    clearInvite();
  };

  const displayMessages = selectedConversation === 'demo' ? demoMessages : messages;

  return (
    <ErrorBoundary>
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
            >
              📶
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="settings-btn"
              aria-label="Settings"
              title="Settings"
            >
              ⚙️
            </button>
            <ConnectionStatus quality={status.connectionQuality} />
          </div>
        </header>

        <div className="app-body">
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
              />
            </ErrorBoundary>
          </aside>

          <main className="main-content" id="main-content" role="main" tabIndex={-1}>
            <ErrorBoundary fallback={<div role="alert">Error loading chat</div>}>
              {selectedConversation ? (
                <ErrorBoundary fallback={<div role="alert">Error in ChatView</div>}>
                  <ChatView
                    conversationId={selectedConversation}
                    messages={displayMessages}
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