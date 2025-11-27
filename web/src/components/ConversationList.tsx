import { useState, useCallback, memo } from 'react';
import './ConversationList.css';
import { AddContactDialog } from './AddContactDialog';
import { SignalingExportDialog, SignalingImportDialog } from './SignalingDialog';
import { LoadingState } from './LoadingState';

interface Conversation {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: number;
  unreadCount: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddContact?: (peerId: string, name: string) => void;
  onImportContact?: (code: string, name: string) => void;
  onShareApp?: () => void;
  localPeerId?: string;
  generateConnectionOffer?: () => Promise<string>;
}

// Memoized conversation item component
const ConversationItem = memo(({
  conv,
  isSelected,
  onSelect
}: {
  conv: Conversation;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => (
  <div
    className={`conversation-item ${isSelected ? 'selected' : ''}`}
    onClick={() => onSelect(conv.id)}
    data-testid={`contact-${conv.name}`}
  >
    <div className="conversation-avatar">
      {conv.name.charAt(0).toUpperCase()}
    </div>
    <div className="conversation-info">
      <div className="conversation-header">
        <span className="conversation-name">{conv.name}</span>
        {conv.timestamp && (
          <span className="conversation-time">
            {new Date(conv.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        )}
      </div>
      {conv.lastMessage && (
        <div className="conversation-preview">
          {conv.lastMessage}
        </div>
      )}
    </div>
    {conv.unreadCount > 0 && (
      <div className="unread-badge">{conv.unreadCount}</div>
    )}
  </div>
));

ConversationItem.displayName = 'ConversationItem';

function ConversationList({ conversations, loading, selectedId, onSelect, onAddContact, onImportContact, onShareApp, localPeerId = '', generateConnectionOffer }: ConversationListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSignalingExport, setShowSignalingExport] = useState(false);
  const [showSignalingImport, setShowSignalingImport] = useState(false);

  // Memoized select handler
  const handleSelect = useCallback((id: string) => {
    onSelect(id);
  }, [onSelect]);

  const handleAddContact = useCallback((peerId: string, name: string) => {
    onAddContact?.(peerId, name);
  }, [onAddContact]);

  const handleImportContact = useCallback((code: string, name: string) => {
    onImportContact?.(code, name);
  }, [onImportContact]);

  return (
    <div className="conversation-list">
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
              <button onClick={() => { setShowAddDialog(true); setShowMenu(false); }} data-testid="quick-add-btn">
                Quick Add (Demo/Testing)
              </button>
              <button onClick={() => { setShowSignalingImport(true); setShowMenu(false); }}>
                Add via Code
              </button>
              <button onClick={() => { setShowSignalingExport(true); setShowMenu(false); }}>
                Share My Info
              </button>
              <button onClick={() => { onShareApp?.(); setShowMenu(false); }}>
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
            conversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isSelected={selectedId === conv.id}
                onSelect={handleSelect}
              />
            ))
          )}
        </LoadingState>
      </div>
    </div>
  );
}

export default memo(ConversationList);
