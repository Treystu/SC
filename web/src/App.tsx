import { useState } from 'react';
import './App.css';
import ConversationList from './components/ConversationList';
import ChatView from './components/ChatView';
import ConnectionStatus from './components/ConnectionStatus';
import { useMeshNetwork } from './hooks/useMeshNetwork';

function App() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const { status, messages, sendMessage } = useMeshNetwork();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sovereign Communications</h1>
        <ConnectionStatus 
          status={status.isConnected ? 'online' : 'offline'}
          peerCount={status.peerCount}
        />
      </header>
      
      <div className="app-body">
        <aside className="sidebar">
          <ConversationList 
            selectedId={selectedConversation}
            onSelect={setSelectedConversation}
          />
        </aside>
        
        <main className="main-content">
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
              <div className="features">
                <div className="feature">
                  <h3>🔒 End-to-End Encrypted</h3>
                  <p>All messages are encrypted with Ed25519 and ChaCha20-Poly1305</p>
                </div>
                <div className="feature">
                  <h3>🌐 Mesh Networking</h3>
                  <p>Direct peer-to-peer communication with no central servers</p>
                </div>
                <div className="feature">
                  <h3>🔗 Multi-Platform</h3>
                  <p>Works on Web, Android, and iOS with seamless connectivity</p>
                </div>
              </div>
              {status.localPeerId && (
                <div className="peer-info">
                  <p><strong>Your Peer ID:</strong> {status.localPeerId.substring(0, 16)}...</p>
                  <p><strong>Connected Peers:</strong> {status.peerCount}</p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
