import { useRef, useEffect, memo, useState } from "react";
import DOMPurify from "dompurify";
import "./ChatView.css";
import { MessageInput } from "./MessageInput";
import { LoadingState } from "./LoadingState";
import { validateFileList } from "@sc/core";
import { getDatabase, StoredMessage } from "../storage/database";
import { ContactProfileDialog } from "./ContactProfileDialog";

const sanitizeHTML = (html: string) => {
  return DOMPurify.sanitize(html);
};

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
  onClose?: () => void;
}

function ChatView({
  conversationId,
  contactName = "Unknown Contact",
  isOnline = false,
  onSendMessage,
  isLoading = false,
  onClose,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [callActive, setCallActive] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-view" data-testid="chat-container">
      <div
        className="chat-header"
        onClick={() => setShowProfile(true)}
        style={{ cursor: "pointer" }}
      >
        {onClose && (
          <button
            className="close-chat-btn"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Back"
            title="Back to list"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        <div className="chat-avatar">{contactName.charAt(0).toUpperCase()}</div>
        <div className="chat-info">
          <h3>{contactName}</h3>
          <span className={`status ${isOnline ? "online" : "offline"}`}>
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>

        {/* Placeholder controls until voice call handling is fully wired into signaling */}
        <div
          className="call-controls"
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}
        >
          <button
            data-testid="voice-call-btn"
            onClick={() => {
              setCallActive(true);
              setCallEnded(false);
            }}
            className="icon-btn"
            title="Start Call"
          >
            📞
          </button>
          <button
            data-testid="end-call-btn"
            onClick={() => {
              setCallActive(false);
              setCallEnded(true);
            }}
            className="icon-btn"
            title="End Call"
            style={{ color: "var(--accent-danger)" }}
          >
            ✕
          </button>
          {callActive && (
            <span data-testid="call-active" className="sr-only">
              Call Active
            </span>
          )}
          {callEnded && (
            <span data-testid="call-ended" className="sr-only">
              Call Ended
            </span>
          )}
        </div>
      </div>

      <div className="chat-messages" data-testid="message-container">
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
                className={`message ${message.senderId === "me" ? "sent" : "received"} `}
              >
                <div className="message-bubble">
                  <div
                    className="message-content"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHTML(message.content),
                    }}
                  ></div>
                  <div className="message-meta">
                    <span
                      className="message-time"
                      data-testid={`message-timestamp-${message.id}`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {message.senderId === "me" && (
                      <span
                        className={`message-status status-${message.status} `}
                        data-testid={`message-status-${message.status}`}
                      >
                        {message.status === "pending" && "○"}
                        {message.status === "queued" && "🕒"}
                        {message.status === "sent" && "✓"}
                        {message.status === "delivered" && "✓✓"}
                        {message.status === "read" && "✓✓"}
                        {message.status === "failed" && "❌"}
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
                  setError(result.error || "Invalid file");
                  return;
                }
              }
              setError(null);
              onSendMessage(content, attachments);
            }
          }}
          onTyping={() => {}}
          data-testid="message-input-component"
        />
      </div>

      {showProfile && (
        <ContactProfileDialog
          contactId={conversationId}
          onClose={() => setShowProfile(false)}
        />
      )}
    </div>
  );
}

export default memo(ChatView);
