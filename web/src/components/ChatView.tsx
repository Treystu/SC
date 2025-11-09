import { useState, useRef, useEffect } from 'react';
import './ChatView.css';

interface Message {
  id: string;
  content: string;
  timestamp: number;
  isSent: boolean;
  status: 'pending' | 'sent' | 'delivered' | 'read';
}

interface ChatViewProps {
  conversationId: string;
  messages?: Array<{
    id: string;
    from: string;
    content: string;
    timestamp: number;
  }>;
  onSendMessage?: (content: string) => void;
}

function ChatView({ conversationId: _conversationId, messages: receivedMessages = [], onSendMessage }: ChatViewProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Convert received messages to display format
  const messages: Message[] = receivedMessages.map(msg => ({
    id: msg.id,
    content: msg.content,
    timestamp: msg.timestamp,
    isSent: msg.from === 'me',
    status: 'sent' as const,
  }));

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;

    if (onSendMessage) {
      onSendMessage(inputValue);
    }
    
    setInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
        {messages.length === 0 ? (
          <div className="empty-chat">
            <p>No messages yet</p>
            <p className="hint">Send a message to start the conversation</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`message ${message.isSent ? 'sent' : 'received'}`}
            >
              <div className="message-bubble">
                <div className="message-content">{message.content}</div>
                <div className="message-meta">
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {message.isSent && (
                    <span className={`message-status status-${message.status}`}>
                      {message.status === 'pending' && '○'}
                      {message.status === 'sent' && '✓'}
                      {message.status === 'delivered' && '✓✓'}
                      {message.status === 'read' && '✓✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          placeholder="Type a message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          rows={1}
        />
        <button 
          className="send-button" 
          onClick={handleSend}
          disabled={!inputValue.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatView;
