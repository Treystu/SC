import { useState } from 'react';
import './ConversationList.css';

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
}

function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  // Mock data - will be replaced with actual state management
  const [conversations] = useState<Conversation[]>([]);

  return (
    <div className="conversation-list">
      <div className="list-header">
        <h2>Conversations</h2>
        <button className="add-button" title="Add Contact">+</button>
      </div>
      
      <div className="list-content">
        {conversations.length === 0 ? (
          <div className="empty-list">
            <p>No conversations yet</p>
            <p className="hint">Add a contact to start messaging</p>
          </div>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${selectedId === conv.id ? 'selected' : ''}`}
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
          ))
        )}
      </div>
    </div>
  );
}

export default ConversationList;
