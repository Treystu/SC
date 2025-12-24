import React from 'react';
import { Message } from '../types';

interface OfflineQueueProps {
  queuedMessages: Message[];
  onRetry: (messageId: string) => void;
  onCancel: (messageId: string) => void;
}

export const OfflineQueue: React.FC<OfflineQueueProps> = ({
  queuedMessages,
  onRetry,
  onCancel,
}) => {
  if (queuedMessages.length === 0) return null;

  return (
    <div className="offline-queue" role="region" aria-label="Offline Message Queue">
      <div className="queue-header">
        <span className="queue-icon" aria-hidden="true">⏳</span>
        <span className="queue-title" id="offline-queue-title">
          {queuedMessages.length} message{queuedMessages.length > 1 ? 's' : ''} queued
        </span>
      </div>
      <div className="queue-list" role="list" aria-labelledby="offline-queue-title">
        {queuedMessages.map((msg) => (
          <div key={msg.id} className="queue-item" role="listitem">
            <div className="queue-content">
              <span className="queue-message">{msg.content.substring(0, 50)}...</span>
              <span className="queue-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="queue-actions">
              <button onClick={() => onRetry(msg.id)} className="btn-retry" aria-label={`Retry sending message: ${msg.content.substring(0, 20)}`}>Retry</button>
              <button onClick={() => onCancel(msg.id)} className="btn-cancel" aria-label={`Cancel sending message: ${msg.content.substring(0, 20)}`}>Cancel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
