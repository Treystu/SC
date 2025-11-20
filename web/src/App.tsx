import { useState, useEffect } from 'react';
import './App.css';
import ConversationList from './components/ConversationList';
import ChatView from './components/ChatView';
import ConnectionStatus from './components/ConnectionStatus';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { OnboardingFlow } from './components/Onboarding/OnboardingFlow';
import { QRCodeShare } from './components/QRCodeShare';
import { useMeshNetwork } from './hooks/useMeshNetwork';
import { useInvite } from './hooks/useInvite';
import { announce } from './utils/accessibility';
import { getDatabase } from './storage/database';

function App() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShareApp, setShowShareApp] = useState(false);
  const [demoMessages, setDemoMessages] = useState<Array<{id: string; from: string; content: string; timestamp: number}>>([]);
  const { status, messages, sendMessage, connectToPeer } = useMeshNetwork();
  
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
    'User' // TODO: Get from user profile
  );

  // Check if onboarding has been completed
  useEffect(() => {
    const onboardingComplete = localStorage.getItem('sc-onboarding-complete');
    if (!onboardingComplete) {
      setShowOnboarding(true);
    }
    
    // Initialize identity keys (placeholder - should use actual identity management)
    // For now, we'll create dummy keys when needed
  }, []);

  // Announce connection status changes to screen readers
  useEffect(() => {
    if (status.isConnected) {
      announce.message(`Connected to ${status.peerCount} peer${status.peerCount === 1 ? '' : 's'}`, 'polite');
    } else {
      announce.message('Disconnected from network', 'polite');
    }
  }, [status.isConnected, status.peerCount]);

  const handleAddContact = async (peerId: string, name: string) => {
    try {
      // Special demo mode for testing without real peers
      if (peerId.toLowerCase() === 'demo') {
        announce.message(`Demo mode activated - messages will echo back`, 'polite');
        setSelectedConversation('demo');
        // Add welcome message
        setTimeout(() => {
          setDemoMessages(prev => [...prev, {
            id: `demo-${Date.now()}`,
            from: 'demo',
            content: `Hi! This is demo mode. Your messages will echo back. Try sending something!`,
            timestamp: Date.now()
          }]);
        }, 500);
        return;
      }
      
      await connectToPeer(peerId);
      announce.message(`Connected to ${name}`, 'polite');
      setSelectedConversation(peerId);
      
      // Save contact to IndexedDB
      try {
        const db = getDatabase();
        await db.saveContact({
          id: peerId,
          publicKey: peerId, // In production, use actual public key
          displayName: name,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          fingerprint: '', // In production, generate from public key
          verified: false,
          blocked: false,
          endpoints: [{ type: 'webrtc' }]
        });
        console.log('Contact saved to IndexedDB:', name);
      } catch (dbError) {
        console.error('Failed to save contact:', dbError);
      }
    } catch (error) {
      console.error('Failed to connect to peer:', error);
      announce.message(`Failed to connect to ${name}`, 'assertive');
    }
  };

  const handleSendMessage = async (content: string) => {
    if (selectedConversation === 'demo') {
      // Add user message
      const userMsg = {
        id: `me-${Date.now()}`,
        from: 'me',
        content,
        timestamp: Date.now()
      };
      setDemoMessages(prev => [...prev, userMsg]);
      
      // Echo back after delay
      setTimeout(() => {
        setDemoMessages(prev => [...prev, {
          id: `demo-${Date.now()}`,
          from: 'demo',
          content: `Echo: ${content}`,
          timestamp: Date.now()
        }]);
      }, 1000);
    } else if (selectedConversation) {
      sendMessage(selectedConversation, content);
      
      // Save message to IndexedDB
      try {
        const db = getDatabase();
        await db.saveMessage({
          id: `msg-${Date.now()}`,
          conversationId: selectedConversation,
          content,
          timestamp: Date.now(),
          senderId: status.localPeerId,
          recipientId: selectedConversation,
          type: 'text',
          status: 'sent'
        });
        console.log('Message saved to IndexedDB');
      } catch (dbError) {
        console.error('Failed to save message:', dbError);
      }
    }
  };

  const handleShareApp = async () => {
    // Initialize keys if not already done (placeholder implementation)
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

      <div className="app" role="application" aria-label="Sovereign Communications Messenger">
        {/* Skip to main content link for keyboard navigation */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="app-header" role="banner">
          <h1>Sovereign Communications</h1>
          <div className="header-controls">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className="settings-btn"
              aria-label="Settings"
              title="Settings"
            >
              ⚙️
            </button>
            <ConnectionStatus 
              status={status.isConnected ? 'online' : 'offline'}
              peerCount={status.peerCount}
            />
          </div>
        </header>
        
        <div className="app-body">
          <aside className="sidebar" role="complementary" aria-label="Conversations">
            <ErrorBoundary fallback={<div role="alert">Error loading conversations</div>}>
              <ConversationList 
                selectedId={selectedConversation}
                onSelect={setSelectedConversation}
                onAddContact={handleAddContact}
                onShareApp={handleShareApp}
                localPeerId={status.localPeerId}
              />
            </ErrorBoundary>
          </aside>
          
          <main className="main-content" id="main-content" role="main" tabIndex={-1}>
            <ErrorBoundary fallback={<div role="alert">Error loading chat</div>}>
              {selectedConversation ? (
                <ChatView 
                  conversationId={selectedConversation}
                  messages={displayMessages}
                  onSendMessage={handleSendMessage}
                />
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
