import { useState, useEffect } from 'react';
import './App.css';
import ConversationList from './components/ConversationList';
import ChatView from './components/ChatView';
import ConnectionStatus from './components/ConnectionStatus';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useMeshNetwork } from './hooks/useMeshNetwork';
import { announce } from './utils/accessibility';

function App() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { status, messages, sendMessage, connectToPeer } = useMeshNetwork();

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
      await connectToPeer(peerId);
      announce.message(`Connected to ${name}`, 'polite');
      // TODO: Save contact to IndexedDB
    } catch (error) {
      console.error('Failed to connect to peer:', error);
      announce.message(`Failed to connect to ${name}`, 'assertive');
    }
  };

  return (
    <ErrorBoundary>
      <div className="app" role="application" aria-label="Sovereign Communications Messenger">
        {/* Skip to main content link for keyboard navigation */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <header className="app-header" role="banner">
          <h1>Sovereign Communications</h1>
          <ConnectionStatus 
            status={status.isConnected ? 'online' : 'offline'}
            peerCount={status.peerCount}
          />
        </header>
        
        <div className="app-body">
          <aside className="sidebar" role="complementary" aria-label="Conversations">
            <ErrorBoundary fallback={<div role="alert">Error loading conversations</div>}>
              <ConversationList 
                selectedId={selectedConversation}
                onSelect={setSelectedConversation}
                onAddContact={handleAddContact}
              />
            </ErrorBoundary>
          </aside>
          
          <main className="main-content" id="main-content" role="main" tabIndex={-1}>
            <ErrorBoundary fallback={<div role="alert">Error loading chat</div>}>
              {selectedConversation ? (
                <ChatView 
                  conversationId={selectedConversation}
                  messages={messages}
                  onSendMessage={(content) => sendMessage(selectedConversation, content)}
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
      </div>
    </ErrorBoundary>
  );
}

export default App;
