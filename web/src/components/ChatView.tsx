
import { useRef, useEffect, useMemo, memo, useState } from 'react';
import DOMPurify from 'dompurify';
import './ChatView.css';
import { MessageInput } from './MessageInput';
import { LoadingState } from './LoadingState';
import { validateFileList } from '@sc/core';
import { getDatabase, StoredMessage } from '../storage/database';

const sanitizeHTML = (html: string) => {
  return DOMPurify.sanitize(html);
};

interface Message {
  id: string;
  content: string;
  timestamp: number;
  isSent: boolean;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'queued' | 'failed';
}

interface ChatViewProps {
  conversationId: string;
  contactName?: string;
  isOnline?: boolean;
  messages?: Array<{
    id: string;
    from: string;
    content: string;
    timestamp: number;
  }>;
  onSendMessage?: (content: string, attachments?: File[]) => void;
  isLoading?: boolean;
}

function ChatView({
  conversationId,
  contactName = 'Unknown Contact',
  isOnline = false,
  onSendMessage,
  isLoading = false
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);

  useEffect(() => {
    const fetchMessages = async () => {
      const db = getDatabase();
      const fetchedMessages = await db.getMessages(conversationId);
      setMessages(fetchedMessages);
    };

    fetchMessages();
  }, [conversationId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-view">
      <div className="chat-header">
        <div className="chat-avatar">{contactName.charAt(0).toUpperCase()}</div>
        <div className="chat-info">
          <h3>{contactName}</h3>
          <span className={`status ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="chat-messages">
        <LoadingState loading={isLoading} error={error ?? undefined}>
          {messages.length === 0 ? (
            <div className="empty-chat">
              <p>No messages yet</p>
              <p className="hint">Send a message to start the conversation</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.senderId === 'me' ? 'sent' : 'received'} `}
              >
                <div className="message-bubble">
                  <div className="message-content" dangerouslySetInnerHTML={{ __html: sanitizeHTML(message.content) }}></div>
                  <div className="message-meta">
                    <span className="message-time" data-testid={`message - timestamp - ${message.id} `}>
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {message.senderId === 'me' && (
                      <span
                        className={`message - status status - ${message.status} `}
                        data-testid={`message - status - ${message.status} `}
                      >
                        {message.status === 'pending' && '○'}
                        {message.status === 'queued' && '🕒'}
                        {message.status === 'sent' && '✓'}
                        {message.status === 'delivered' && '✓✓'}
                        {message.status === 'read' && '✓✓'}
                        {message.status === 'failed' && '❌'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </LoadingState>
      </div>

      <div className="chat-input-container">
        {error && <div className="error-message">{error}</div>}
        <MessageInput
          onSendMessage={(content, attachments) => {
            if (onSendMessage) {
              if (attachments) {
                const result = validateFileList(attachments);
                if (!result.valid) {
                  setError(result.error || 'Invalid file');
                  return;
                }
              }
              setError(null);
              onSendMessage(content, attachments);
            }
          }}
          onTyping={() => { }}
          data-testid="message-input-component"
        />
      </div>
    </div>
  );
}

export default memo(ChatView);
