
import { useRef, useEffect, useMemo, memo, useState } from 'react';
import DOMPurify from 'dompurify';
import './ChatView.css';
import { MessageInput } from './MessageInput';
import { LoadingState } from './LoadingState';
import { validateFileList } from '@sc/core';

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
  messages?: Array<{
    id: string;
    from: string;
    content: string;
    timestamp: number;
  }>;
  onSendMessage?: (content: string, attachments?: File[]) => void;
  isLoading?: boolean;
}

function ChatView({ conversationId: _conversationId, messages: receivedMessages = [], onSendMessage, isLoading = false }: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Memoize message transformation to prevent unnecessary recalculations
  const messages: Message[] = useMemo(() =>
    receivedMessages.map(msg => ({
      id: msg.id,
      content: msg.content,
      timestamp: msg.timestamp,
      isSent: msg.from === 'me',
      status: (msg as any).status || 'sent',
    })), [receivedMessages]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-view">
      <div className="chat-header">
        <div className="chat-avatar">C</div>
        <div className="chat-info">
          <h3>Contact Name</h3>
          <span className="status">Online</span>
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
                className={`message ${message.isSent ? 'sent' : 'received'} `}
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
                    {message.isSent && (
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
        />
      </div>
    </div>
  );
}

export default memo(ChatView);
