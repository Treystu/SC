import { useState, useCallback, memo } from 'react';
import './ConversationList.css';
import { AddContactDialog } from './AddContactDialog';
import { SignalingExportDialog, SignalingImportDialog } from './SignalingDialog';

interface Conversation {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: number;
  unreadCount: number;
}

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddContact?: (peerId: string, name: string) => void;
  onShareApp?: () => void;
  localPeerId?: string;
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

function ConversationList({ selectedId, onSelect, onAddContact, onShareApp, localPeerId = '' }: ConversationListProps) {
  // Mock data - will be replaced with actual state management
  const [conversations] = useState<Conversation[]>([]);
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
      />
      
      <SignalingImportDialog
        isOpen={showSignalingImport}
        onClose={() => setShowSignalingImport(false)}
        onImport={handleAddContact}
      />
      
      <div className="list-header">
        <h2>Conversations</h2>
        <div className="header-actions">
          <button 
            className="add-button" 
            title="Add Options"
            onClick={() => setShowMenu(!showMenu)}
          >
            +
          </button>
          {showMenu && (
            <div className="add-menu">
              <button onClick={() => { setShowAddDialog(true); setShowMenu(false); }}>
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
      </div>
    </div>
  );
}

export default memo(ConversationList);
