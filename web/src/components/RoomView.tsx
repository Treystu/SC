import { useState, useEffect, useRef } from "react";
import "./RoomView.css";
import { generateMobileBootstrapUrl } from "../utils/peerBootstrap";

interface RoomViewProps {
  isOpen: boolean;
  onClose: () => void;
  discoveredPeers: string[];
  connectedPeers: string[];
  roomMessages: any[];
  onSendMessage: (content: string) => void;
  onConnect: (peerId: string) => Promise<void>;
  localPeerId: string;
  embedded?: boolean;
}

export function RoomView({
  isOpen,
  onClose,
  discoveredPeers,
  connectedPeers,
  roomMessages,
  onSendMessage,
  onConnect,
  localPeerId,
  embedded = false,
}: RoomViewProps) {
  const [message, setMessage] = useState("");
  const [connectingPeers, setConnectingPeers] = useState<Set<string>>(
    new Set(),
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [roomMessages]);

  if (!isOpen && !embedded) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage("");
    }
  };

  const handleConnectClick = async (peerId: string) => {
    setConnectingPeers((prev) => new Set(prev).add(peerId));
    try {
      await onConnect(peerId);
    } finally {
      setConnectingPeers((prev) => {
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    }
  };

  // Filter peers
  const uniqueDiscovered = discoveredPeers.filter(
    (p) => !connectedPeers.includes(p) && p !== localPeerId,
  );
  const uniqueConnected = connectedPeers.filter((p) => p !== localPeerId);

  const isAndroid = /Android/i.test(navigator.userAgent);
  const apkDownloadUrl = "https://github.com/Treystu/SC/releases/latest/download/app-release.apk";
  const DEEP_LINK_DELAY_MS = 1000; // Delay before opening deep link

  const handleDownloadMobileApp = () => {
    const bootstrapUrl = generateMobileBootstrapUrl(undefined, undefined, true);
    
    if (isAndroid) {
      // Direct APK download with bootstrap context
      window.location.href = apkDownloadUrl;
      // Also open the deep link to set context if app is already installed
      setTimeout(() => {
        // Convert HTTPS URL to custom scheme for deep link
        const deepLink = bootstrapUrl.replace(/^https:\/\/[^/]+/, 'sc:');
        window.location.href = deepLink;
      }, DEEP_LINK_DELAY_MS);
    } else {
      // For iOS or other platforms, navigate to join page
      window.location.href = bootstrapUrl;
    }
  };

  return (
    <div className={embedded ? "room-embedded" : "room-overlay"}>
      <div className="room-container">
        <div className="room-header">
          <div className="room-title">
            <h2>🌐 Public Room</h2>
            <span className="room-status">
              {uniqueDiscovered.length + uniqueConnected.length + 1} Online
            </span>
          </div>
          {embedded ? (
            <>
              <button
                className="download-app-btn"
                onClick={handleDownloadMobileApp}
                title="Download mobile app with current peers"
                style={{ marginRight: '8px' }}
              >
                📲 Get Mobile App
              </button>
              <button
                className="close-room-btn"
                onClick={onClose}
                title="Close view"
              >
                ×
              </button>
            </>
          ) : (
            <>
              <button
                className="download-app-btn"
                onClick={handleDownloadMobileApp}
                title="Download mobile app with current peers"
                style={{ marginRight: '8px' }}
              >
                📲 Get Mobile App
              </button>
              <button className="close-btn" onClick={onClose}>
                Leave Room
              </button>
            </>
          )}
        </div>

        <div className="room-content">
          {/* Sidebar: Peers */}
          <div className="room-sidebar">
            <div className="peers-section">
              <h3>Connected Mesh ({uniqueConnected.length})</h3>
              <div className="peers-list">
                {uniqueConnected.length === 0 && (
                  <p className="empty-text">No active connections</p>
                )}
                {uniqueConnected.map((peerId) => (
                  <div key={peerId} className="peer-item connected">
                    <div className="peer-avatar">
                      {peerId.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="peer-info">
                      <span className="peer-id">
                        {peerId.substring(0, 12)}...
                      </span>
                      <span className="peer-status">Connected</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="peers-section">
              <h3>Discovered ({uniqueDiscovered.length})</h3>
              <div className="peers-list">
                {uniqueDiscovered.length === 0 && (
                  <p className="empty-text">Scanning for peers...</p>
                )}
                {uniqueDiscovered.map((peerId) => (
                  <div key={peerId} className="peer-item discovered">
                    <div className="peer-avatar">
                      {peerId.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="peer-info">
                      <span className="peer-id">
                        {peerId.substring(0, 12)}...
                      </span>
                      <button
                        className="connect-btn"
                        onClick={() => handleConnectClick(peerId)}
                        disabled={connectingPeers.has(peerId)}
                      >
                        {connectingPeers.has(peerId)
                          ? "Connecting..."
                          : "Connect"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main: Chat */}
          <div className="room-chat">
            <div className="chat-messages">
              {roomMessages.length === 0 && (
                <div className="welcome-message">
                  <h3>Welcome to the Room!</h3>
                  <p>
                    Messages sent here are broadcast to everyone in the room.
                  </p>
                  <p>Connect with peers to start private, encrypted chats.</p>
                </div>
              )}
              {roomMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`chat-message ${msg.peerId === localPeerId ? "own" : ""}`}
                >
                  <div className="message-header">
                    <span className="message-sender">
                      {msg.peerId === localPeerId
                        ? "You"
                        : msg.peerId?.substring(0, 8)}
                    </span>
                    <span className="message-time">
                      {new Date(
                        msg.timestamp || Date.now(),
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content">
                    {msg.payload?.content || msg.content}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-area" onSubmit={handleSend}>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a public message..."
                className="chat-input"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!message.trim()}
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
