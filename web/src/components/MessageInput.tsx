// Message Input Component - Compose and send messages
// Task 219: Message input with file attachments and formatting

import React, { useState, useRef, KeyboardEvent } from "react";
import { VoiceRecorder } from "./VoiceRecorder";
import "./MessageInput.css";

interface MessageInputProps {
  onSendMessage: (content: string, attachments?: File[]) => void;
  onTyping: () => void;
  onSendVoice?: (audioBlob: Blob) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  onTyping,
  onSendVoice,
  disabled = false,
  placeholder = "Type a message...",
}) => {
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showFileDialog, setShowFileDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }

    // Emit typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onTyping();
    typingTimeoutRef.current = setTimeout(() => {
      // Stop typing indicator
    }, 1000);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage && attachments.length === 0) return;

    onSendMessage(
      trimmedMessage,
      attachments.length > 0 ? attachments : undefined,
    );

    setMessage("");
    setAttachments([]);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments((prev) => [...prev, ...files]);
    setShowFileDialog(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleVoiceRecord = () => {
    setIsRecording(!isRecording);
    // Voice recording logic would go here
  };

  return (
    <div className="message-input-container">
      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="attachments-preview">
          {attachments.map((file, index) => (
            <div key={index} className="attachment-chip">
              <span>📎</span>
              <div>
                <div className="attachment-name">{file.name}</div>
                <div className="attachment-size">
                  {formatFileSize(file.size)}
                </div>
              </div>
              <button
                onClick={() => removeAttachment(index)}
                className="remove-attachment-btn"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="input-area">
        {/* Action Buttons */}
        <div className="input-actions">
          <button
            onClick={() => {
              setShowFileDialog((prev) => !prev);
            }}
            disabled={disabled}
            data-testid="attach-file-btn"
            aria-controls="file-upload-dialog"
            className="action-btn"
            title="Attach file"
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
            data-testid="file-input"
            aria-label="Upload file"
          />

          <button
            onClick={handleVoiceRecord}
            disabled={disabled}
            data-testid="voice-record-btn"
            className={`action-btn ${isRecording ? "recording" : ""}`}
            title={isRecording ? "Stop recording" : "Start voice recording"}
          >
            🎤
          </button>
        </div>

        {/* Text Input */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          data-testid="message-input"
          className="message-textarea"
        />

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || (!message.trim() && attachments.length === 0)}
          data-testid="send-message-btn"
          aria-label="Send message"
          className="send-btn"
        >
          Send
        </button>
      </div>

      {showFileDialog && (
        <div
          id="file-upload-dialog"
          data-testid="file-upload-dialog"
          className="file-upload-dialog"
        >
          <div className="dialog-header">
            <span>Choose files to send</span>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="browse-btn"
                aria-label="Open file picker"
              >
                Browse
              </button>
              <button
                onClick={() => setShowFileDialog(false)}
                className="close-dialog-btn"
                aria-label="Close file dialog"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {isRecording && (
        <VoiceRecorder
          onRecordingComplete={(audioBlob) => {
            setIsRecording(false);
            if (onSendVoice) {
              onSendVoice(audioBlob);
            }
          }}
          onCancel={() => setIsRecording(false)}
        />
      )}

      {/* Helper Text */}
      <div className="helper-text">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
};
