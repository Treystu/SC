import { useRef, useEffect, memo, useState, useMemo } from "react";
import DOMPurify from "dompurify";
import "./ChatView.css";
import { MessageInput } from "./MessageInput";
import { LoadingState } from "./LoadingState";
import { validateFileList } from "@sc/core";
import { getDatabase } from "../storage/database";
import { ContactProfileDialog } from "./ContactProfileDialog";
import { MessageReactions } from "./MessageReactions";
import { VoicePlayer } from "./VoicePlayer";

const sanitizeHTML = (html: string) => {
  return DOMPurify.sanitize(html);
};

const looksLikeHtml = (value: string): boolean => {
  return /<[^>]+>/.test(value);
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
    conversationId?: string;
    status?: string;
  }>;
  onSendMessage?: (content: string, attachments?: File[]) => void;
  onSendVoice?: (audioBlob: Blob) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  isLoading?: boolean;
  onClose?: () => void;
  onUpdateContact?: () => void;
  requestStatus?: 'pending' | 'accepted' | 'ignored' | 'blocked';
  onAcceptRequest?: () => void;
  onIgnoreRequest?: () => void;
}

function ChatView({
  conversationId,
  contactName = "Unknown Contact",
  isOnline = false,
  onSendMessage,
  onSendVoice,
  onReaction,
  isLoading = false,
  messages: liveMessages = [], // Live messages from useMeshNetwork
  onClose,
  onUpdateContact,
  requestStatus,
  onAcceptRequest,
  onIgnoreRequest,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<any[]>([]); // Using any to simplify type matching for now
  const [callActive, setCallActive] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    const fetchMessages = async () => {
      const db = getDatabase();
      const idsToTry = Array.from(
        new Set([
          conversationId,
          conversationId.toLowerCase(),
          conversationId.toUpperCase(),
        ]),
      );

      const results: any[] = [];
      for (const id of idsToTry) {
        try {
          const msgs = await db.getMessages(id);
          if (Array.isArray(msgs) && msgs.length > 0) {
            results.push(...msgs);
          }
        } catch {
          // ignore
        }
      }

      const byId = new Map<string, any>();
      for (const m of results) {
        if (m && m.id) byId.set(m.id, m);
      }
      const fetchedMessages = Array.from(byId.values());

      setHistoryMessages(fetchedMessages);

      if (typeof navigator !== "undefined" && navigator.webdriver === true) {
        try {
          console.log("[E2E] Loaded history messages", {
            conversationId,
            count: fetchedMessages.length,
            lastContent:
              fetchedMessages.length > 0
                ? (fetchedMessages[fetchedMessages.length - 1] as any).content
                : null,
          });
        } catch {
          // ignore
        }
      }
    };

    fetchMessages();
  }, [conversationId]);

  // Merge history and live messages
  const displayedMessages = useMemo(() => {
    const msgMap = new Map<string, any>();

    historyMessages.forEach((m) => {
      if (m && m.id) msgMap.set(m.id, m);
    });

    // Add/Update with live messages (optimistic updates map "from" to "senderId")
    liveMessages.forEach((m) => {
      if (!m) return;

      const convKey =
        (typeof m.conversationId === "string" && m.conversationId) ||
        (typeof m.from === "string" && m.from) ||
        "";

      const convKeyMatch =
        convKey === conversationId ||
        convKey.toLowerCase() === conversationId.toLowerCase();

      if (convKeyMatch) {
        const existing = m.id ? msgMap.get(m.id) : undefined;
        if (!existing || (existing.timestamp ?? 0) <= (m.timestamp ?? 0)) {
          if (m.id) msgMap.set(m.id, m);
        }
      }
    });

    const combined = Array.from(msgMap.values());

    // Secondary dedupe for cases where ids differ but the message is the same
    const byKey = new Map<string, any>();
    for (const m of combined) {
      const key =
        (m as any).id ??
        `${String((m as any).timestamp)}-${String((m as any).from)}-${String(
          (m as any).content,
        )}`;
      byKey.set(key, m);
    }

    return Array.from(byKey.values()).sort(
      (a, b) => (a as any).timestamp - (b as any).timestamp,
    );
  }, [historyMessages, liveMessages, conversationId]);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages]);

  return (
    <div
      className="chat-view"
      data-testid="chat-container"
      data-conversation-id={conversationId}
    >
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

        {/* Smart Call Controls - Only show when relevant */}
        <div
          className="call-controls"
          onClick={(e) => e.stopPropagation()}
          style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          {/* Only show call button if online and not in active call context */}
          {isOnline && !callActive && !callEnded && !onClose && (
            <button
              data-testid="voice-call-btn"
              onClick={() => {
                setCallActive(true);
                setCallEnded(false);
              }}
              className="icon-btn call-btn"
              title="Start Call"
              aria-label="Start Voice Call"
            >
              📞
            </button>
          )}
          
          {/* Active Call Controls */}
          {callActive && (
            <div className="active-call-controls" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="call-status badge">On Call</span>
              <button
                data-testid="end-call-btn"
                onClick={() => {
                  setCallActive(false);
                  setCallEnded(true);
                }}
                className="icon-btn hangup-btn"
                title="End Call"
                aria-label="End Call"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                  <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="chat-messages" data-testid="message-container">
        <LoadingState loading={isLoading} error={error ?? undefined}>
          {displayedMessages.length === 0 ? (
            <div className="empty-chat">
              <p>No messages yet</p>
              <p className="hint">Send a message to start the conversation</p>
            </div>
          ) : (
            displayedMessages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.senderId === "me" || message.from === "me" ? "sent" : "received"} `}
              >
                <div className="message-bubble">
                  <div className="message-content-wrapper">
                    {message.type === 0x04 ? (
                      <VoicePlayer
                        audioUrl={
                          message.metadata?.blob
                            ? URL.createObjectURL(message.metadata.blob)
                            : ""
                        }
                        duration={message.metadata?.duration || 0}
                      />
                    ) : (
                      <div className="message-content">
                        {typeof message.content === "string" &&
                        looksLikeHtml(message.content) ? (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: sanitizeHTML(message.content),
                            }}
                          />
                        ) : (
                          <span>{String(message.content)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <MessageReactions
                    messageId={message.id}
                    reactions={message.reactions || []}
                    onAddReaction={(emoji) => {
                      if (onReaction) {
                        onReaction(message.id, emoji);
                      }
                    }}
                  />

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
                    {(message.senderId === "me" || message.from === "me") && (
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
        {requestStatus === 'pending' ? (
          <div className="message-request-banner" style={{
            padding: '1rem',
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <p><strong>{contactName}</strong> wants to send you a message.</p>
            <p className="text-sm text-gray-500">Do you want to accept this request? They won't know you've read it until you accept.</p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button 
                onClick={onAcceptRequest}
                className="btn-primary"
                style={{ padding: '0.5rem 1.5rem' }}
              >
                Accept
              </button>
              <button 
                onClick={onIgnoreRequest}
                className="btn-danger"
                style={{ padding: '0.5rem 1.5rem' }}
              >
                Block & Delete
              </button>
            </div>
          </div>
        ) : (
          <>
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
              onSendVoice={onSendVoice}
              onTyping={() => {}}
              disabled={isLoading || !conversationId}
            />
          </>
        )}
      </div>

      {showProfile && (
        <ContactProfileDialog
          contactId={conversationId}
          onClose={() => setShowProfile(false)}
          onUpdate={onUpdateContact}
        />
      )}
    </div>
  );
}

export default memo(ChatView);
