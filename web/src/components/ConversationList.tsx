import { useState, useCallback, memo } from "react";
import "./ConversationList.css";
import { AddContactDialog } from "./AddContactDialog";
import {
  SignalingExportDialog,
  SignalingImportDialog,
} from "./SignalingDialog";
import { LoadingState } from "./LoadingState";
import { ManualConnectionModal } from "./ManualConnectionModal";

interface Conversation {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: number;
  unreadCount: number;
  verified?: boolean;
  online?: boolean;
}

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAddContact?: (peerId: string, name: string) => void;
  onImportContact?: (code: string, name: string) => void;
  onShareApp?: () => void;
  localPeerId?: string;
  generateConnectionOffer?: () => Promise<string>;
  onJoinRoom?: (url: string) => Promise<void> | void;
  onJoinRelay?: (url: string) => void;
  onInitiateConnection?: (peerId: string) => void;
  connectionStatus?: boolean;
}

// Memoized conversation item component
const ConversationItem = memo(
  ({
    conv,
    isSelected,
    onSelect,
    onDelete,
    connectionStatus,
  }: {
    conv: Conversation;
    isSelected: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    connectionStatus?: boolean;
  }) => (
    <div
      className={`conversation-item ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(conv.id)}
      data-testid={`contact-${conv.name}`}
      data-peer-id={conv.id}
    >
      <div className="conversation-avatar" data-testid={`peer-${conv.name}`}>
        {conv.name.charAt(0).toUpperCase()}
      </div>
      <div className="conversation-info">
        <div className="conversation-header">
          <span className="conversation-name">{conv.name}</span>
          <span className="conversation-status" data-testid={`peer-${conv.name}-status`}>
            {/*
              conv.online is derived from live peer presence; if unavailable,
              fall back to overall mesh connectionStatus to signal connectivity.
            */}
            {(conv.online ?? connectionStatus) ? "online" : "offline"}
          </span>
          {conv.timestamp && (
            <span className="conversation-time">
              {new Date(conv.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        {conv.lastMessage && (
          <div className="conversation-preview">{conv.lastMessage}</div>
        )}
      </div>
      {conv.unreadCount > 0 && (
        <div className="unread-badge">{conv.unreadCount}</div>
      )}
      {conv.verified && (
        <span className="verification-badge" data-testid={`peer-${conv.name}-verified`}>
          ✓
        </span>
      )}
      <button
        className="delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("Are you sure you want to delete this conversation?")) {
            onDelete(conv.id);
          }
        }}
        title="Delete conversation"
      >
        ×
      </button>
    </div>
  ),
);

ConversationItem.displayName = "ConversationItem";

function ConversationList({
  conversations,
  loading,
  selectedId,
  onSelect,
  onDelete,
  onAddContact,
  onImportContact,
  onShareApp,
  localPeerId = "",
  generateConnectionOffer,
  onJoinRoom,
  onJoinRelay,
  onInitiateConnection,
  connectionStatus = false,
}: ConversationListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSignalingExport, setShowSignalingExport] = useState(false);
  const [showSignalingImport, setShowSignalingImport] = useState(false);
  const [showManualConnection, setShowManualConnection] = useState(false);

  // Memoized select handler
  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  const handleAddContact = useCallback(
    (peerId: string, name: string) => {
      return onAddContact?.(peerId, name);
    },
    [onAddContact],
  );

  const handleImportContact = useCallback(
    (code: string, name: string) => {
      onImportContact?.(code, name);
    },
    [onImportContact],
  );

  return (
    <div className="conversation-list" data-testid="peer-list">
      <AddContactDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddContact}
      />

      <SignalingExportDialog
        isOpen={showSignalingExport}
        onClose={() => setShowSignalingExport(false)}
        localPeerId={localPeerId}
        generateOffer={generateConnectionOffer}
      />

      <SignalingImportDialog
        isOpen={showSignalingImport}
        onClose={() => setShowSignalingImport(false)}
        onImport={handleImportContact}
      />

      <ManualConnectionModal
        isOpen={showManualConnection}
        onClose={() => setShowManualConnection(false)}
        onInitiateConnection={onInitiateConnection}
      />

      <div className="list-header">
        <h2>Conversations</h2>
        <div className="header-actions">
          <button
            className="add-button"
            title="Add Options"
            onClick={() => setShowMenu(!showMenu)}
            data-testid="add-contact-btn"
          >
            +
          </button>
          {showMenu && (
            <div className="add-menu">
              <button
                onClick={async () => {
                  // Fast path to seed a demo conversation for automated tests
                  const demoId = `peer-${Date.now().toString(16)}`;
                  await handleAddContact(demoId, "Test Peer");
                  setShowMenu(false);
                  handleSelect(demoId);
                }}
                data-testid="quick-add-btn"
              >
                Quick Add (Demo/Testing)
              </button>
              <button
                onClick={() => {
                  setShowSignalingImport(true);
                  setShowMenu(false);
                }}
                data-testid="add-via-code-btn"
              >
                Add via Code
              </button>
              <button
                onClick={() => {
                  setShowSignalingExport(true);
                  setShowMenu(false);
                }}
                data-testid="share-my-info-btn"
              >
                Share My Info
              </button>
              <button
                onClick={() => {
                  setShowManualConnection(true);
                  setShowMenu(false);
                }}
                data-testid="manual-connect-btn"
              >
                Manual Connect (WAN)
              </button>
              <button
                onClick={async (e) => {
                  const defaultUrl =
                    window.location.origin + "/.netlify/functions/room";
                  const url = prompt("Enter Public Room URL:", defaultUrl);
                  if (url) {
                    const btn = e.currentTarget;
                    const originalText = btn.innerText;
                    btn.innerText = "Joining...";
                    btn.disabled = true;
                    try {
                      await onJoinRoom?.(url);
                      alert("Successfully joined room! Discovery active.");
                    } catch (err) {
                      alert(
                        "Failed to join room: " +
                          (err instanceof Error ? err.message : String(err)),
                      );
                    } finally {
                      btn.innerText = originalText;
                      btn.disabled = false;
                      setShowMenu(false);
                    }
                  } else {
                    setShowMenu(false);
                  }
                }}
                data-testid="join-public-room-btn"
              >
                🌐 Join Public Room (Netlify)
              </button>
              <button
                onClick={() => {
                  const url = prompt(
                    "Enter Relay Server URL:",
                    "ws://localhost:8080",
                  );
                  if (url) {
                    onJoinRelay?.(url);
                  }
                  setShowMenu(false);
                }}
                data-testid="join-relay-btn"
              >
                🔌 Join Relay (WebSocket)
              </button>
              <button
                onClick={() => {
                  onShareApp?.();
                  setShowMenu(false);
                }}
                data-testid="share-app-btn"
              >
                📤 Share App
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="list-content">
        <LoadingState loading={loading}>
          {conversations.length === 0 ? (
            <div className="empty-list">
              <p>No conversations yet</p>
              <p className="hint">Add a contact to start messaging</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isSelected={selectedId === conv.id}
                onSelect={handleSelect}
                onDelete={handleDelete}
                connectionStatus={connectionStatus}
              />
            ))
          )}
        </LoadingState>
      </div>
    </div>
  );
}

export default memo(ConversationList);
