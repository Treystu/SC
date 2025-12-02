/**
 * RTC Session Manager with enhanced queue/outbox/backpressure handling
 * Provides robust message handling for WebRTC data channels
 */

export interface RTCOutboxMessage {
  id: string;
  data: Uint8Array | string;
  priority: MessagePriority;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  onSuccess?: () => void;
  onFailure?: (error: Error) => void;
}

export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';

export interface RTCSessionConfig {
  /** Maximum number of messages in outbox (default: 1000) */
  maxOutboxSize?: number;
  /** High water mark for backpressure (default: 16KB) */
  highWaterMark?: number;
  /** Low water mark to resume sending (default: 8KB) */
  lowWaterMark?: number;
  /** Heartbeat interval in ms (default: 10000) */
  heartbeatInterval?: number;
  /** Heartbeat timeout in ms (default: 5000) */
  heartbeatTimeout?: number;
  /** Default message timeout in ms (default: 30000) */
  defaultTimeout?: number;
  /** Default max retries (default: 3) */
  defaultMaxRetries?: number;
}

export interface RTCSessionStats {
  outboxSize: number;
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  messagesDropped: number;
  avgLatency: number;
  lastHeartbeat: number;
  isUnderBackpressure: boolean;
}

type MessageHandler = (data: Uint8Array | string) => void;
type StateHandler = (state: RTCDataChannelState) => void;

/**
 * RTC Session Manager
 * Manages message queuing, backpressure, and heartbeat for RTC data channels
 */
export class RTCSessionManager {
  private dataChannel: RTCDataChannel | null = null;
  private config: Required<RTCSessionConfig>;
  private outbox: RTCOutboxMessage[] = [];
  private pendingMessages = new Map<string, RTCOutboxMessage>();
  private isUnderBackpressure = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat = 0;
  private lastPongTime = 0;
  private stats = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    messagesDropped: 0,
    latencySum: 0,
    latencyCount: 0
  };
  private messageHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<StateHandler>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: RTCSessionConfig = {}) {
    this.config = {
      maxOutboxSize: config.maxOutboxSize ?? 1000,
      highWaterMark: config.highWaterMark ?? 16 * 1024,
      lowWaterMark: config.lowWaterMark ?? 8 * 1024,
      heartbeatInterval: config.heartbeatInterval ?? 10000,
      heartbeatTimeout: config.heartbeatTimeout ?? 5000,
      defaultTimeout: config.defaultTimeout ?? 30000,
      defaultMaxRetries: config.defaultMaxRetries ?? 3
    };
  }

  /**
   * Attach to a data channel
   */
  attach(dataChannel: RTCDataChannel): void {
    if (this.dataChannel) {
      this.detach();
    }

    this.dataChannel = dataChannel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.handleOpen();
    };

    this.dataChannel.onclose = () => {
      this.handleClose();
    };

    this.dataChannel.onerror = (event) => {
      this.handleError(event);
    };

    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event);
    };

    this.dataChannel.onbufferedamountlow = () => {
      this.handleBufferedAmountLow();
    };

    // Set buffer threshold
    this.dataChannel.bufferedAmountLowThreshold = this.config.lowWaterMark;

    if (this.dataChannel.readyState === 'open') {
      this.handleOpen();
    }
  }

  /**
   * Detach from the current data channel
   */
  detach(): void {
    this.stopHeartbeat();
    
    if (this.dataChannel) {
      this.dataChannel.onopen = null;
      this.dataChannel.onclose = null;
      this.dataChannel.onerror = null;
      this.dataChannel.onmessage = null;
      this.dataChannel.onbufferedamountlow = null;
      this.dataChannel = null;
    }
  }

  /**
   * Send a message with optional priority and callbacks
   */
  send(
    data: Uint8Array | string,
    options: {
      priority?: MessagePriority;
      timeout?: number;
      maxRetries?: number;
      onSuccess?: () => void;
      onFailure?: (error: Error) => void;
    } = {}
  ): string {
    const message: RTCOutboxMessage = {
      id: generateMessageId(),
      data,
      priority: options.priority ?? 'normal',
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.defaultMaxRetries,
      timeout: options.timeout ?? this.config.defaultTimeout,
      onSuccess: options.onSuccess,
      onFailure: options.onFailure
    };

    this.enqueue(message);
    this.scheduleFlush();

    return message.id;
  }

  /**
   * Send a message immediately (bypass queue)
   */
  sendImmediate(data: Uint8Array | string): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.dataChannel.send(data as any);
      this.updateSentStats(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register a state change handler
   */
  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /**
   * Get session statistics
   */
  getStats(): RTCSessionStats {
    return {
      outboxSize: this.outbox.length,
      bytesSent: this.stats.bytesSent,
      bytesReceived: this.stats.bytesReceived,
      messagesSent: this.stats.messagesSent,
      messagesReceived: this.stats.messagesReceived,
      messagesDropped: this.stats.messagesDropped,
      avgLatency: this.stats.latencyCount > 0 
        ? this.stats.latencySum / this.stats.latencyCount 
        : 0,
      lastHeartbeat: this.lastHeartbeat,
      isUnderBackpressure: this.isUnderBackpressure
    };
  }

  /**
   * Clear the outbox
   */
  clearOutbox(): void {
    const failedMessages = [...this.outbox];
    this.outbox = [];

    failedMessages.forEach(msg => {
      msg.onFailure?.(new Error('Outbox cleared'));
    });
  }

  /**
   * Cancel a pending message
   */
  cancel(messageId: string): boolean {
    const index = this.outbox.findIndex(m => m.id === messageId);
    if (index !== -1) {
      const msg = this.outbox.splice(index, 1)[0];
      msg.onFailure?.(new Error('Message cancelled'));
      return true;
    }
    return false;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.clearOutbox();
    this.detach();
    this.messageHandlers.clear();
    this.stateHandlers.clear();
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private handleOpen(): void {
    this.notifyStateChange('open');
    this.startHeartbeat();
    this.flush();
  }

  private handleClose(): void {
    this.notifyStateChange('closed');
    this.stopHeartbeat();
  }

  private handleError(_event: Event): void {
    // Error handling - messages in outbox will be retried
    console.error('RTC data channel error');
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data;
    this.updateReceivedStats(data);

    // Handle heartbeat messages
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'ping') {
          this.sendImmediate(JSON.stringify({ type: 'pong', timestamp: parsed.timestamp }));
          return;
        }
        if (parsed.type === 'pong') {
          this.handlePong(parsed.timestamp);
          return;
        }
      } catch {
        // Not a JSON message, forward to handlers
      }
    }

    // Forward to handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  private handleBufferedAmountLow(): void {
    this.isUnderBackpressure = false;
    this.flush();
  }

  private handlePong(timestamp: number): void {
    this.lastPongTime = Date.now();
    const latency = this.lastPongTime - timestamp;
    this.stats.latencySum += latency;
    this.stats.latencyCount++;
    this.clearHeartbeatTimeout();
  }

  private enqueue(message: RTCOutboxMessage): void {
    // Check outbox size
    if (this.outbox.length >= this.config.maxOutboxSize) {
      // Drop lowest priority message
      const lowestPriorityIndex = this.findLowestPriorityIndex();
      const dropped = this.outbox.splice(lowestPriorityIndex, 1)[0];
      dropped.onFailure?.(new Error('Outbox full, message dropped'));
      this.stats.messagesDropped++;
    }

    // Insert based on priority
    const insertIndex = this.findInsertIndex(message.priority);
    this.outbox.splice(insertIndex, 0, message);
  }

  private findLowestPriorityIndex(): number {
    const priorities: MessagePriority[] = ['low', 'normal', 'high', 'critical'];
    
    for (const priority of priorities) {
      for (let i = this.outbox.length - 1; i >= 0; i--) {
        if (this.outbox[i].priority === priority) {
          return i;
        }
      }
    }
    
    return this.outbox.length - 1;
  }

  private findInsertIndex(priority: MessagePriority): number {
    const priorityOrder: Record<MessagePriority, number> = {
      critical: 0,
      high: 1,
      normal: 2,
      low: 3
    };

    const targetOrder = priorityOrder[priority];

    for (let i = 0; i < this.outbox.length; i++) {
      if (priorityOrder[this.outbox[i].priority] > targetOrder) {
        return i;
      }
    }

    return this.outbox.length;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 0);
  }

  private flush(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return;
    }

    // Check backpressure
    if (this.dataChannel.bufferedAmount > this.config.highWaterMark) {
      this.isUnderBackpressure = true;
      return;
    }

    const now = Date.now();
    const toSend: RTCOutboxMessage[] = [];
    const toKeep: RTCOutboxMessage[] = [];

    for (const msg of this.outbox) {
      // Check timeout
      if (now - msg.timestamp > msg.timeout) {
        msg.onFailure?.(new Error('Message timeout'));
        this.stats.messagesDropped++;
        continue;
      }

      // Check backpressure
      if (this.dataChannel.bufferedAmount > this.config.highWaterMark) {
        this.isUnderBackpressure = true;
        toKeep.push(msg);
        continue;
      }

      toSend.push(msg);
    }

    this.outbox = toKeep;

    // Send messages
    for (const msg of toSend) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.dataChannel.send(msg.data as any);
        this.updateSentStats(msg.data);
        msg.onSuccess?.();
      } catch (error) {
        // Retry
        if (msg.retryCount < msg.maxRetries) {
          msg.retryCount++;
          this.outbox.push(msg);
        } else {
          msg.onFailure?.(error as Error);
          this.stats.messagesDropped++;
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      this.lastHeartbeat = Date.now();
      this.sendImmediate(JSON.stringify({ type: 'ping', timestamp: this.lastHeartbeat }));
      this.startHeartbeatTimeout();
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private startHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();

    this.heartbeatTimeoutTimer = setTimeout(() => {
      console.warn('RTC heartbeat timeout - connection may be dead');
      // Close the data channel to trigger reconnection
      if (this.dataChannel) {
        this.dataChannel.close();
      }
    }, this.config.heartbeatTimeout);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private updateSentStats(data: Uint8Array | string): void {
    const bytes = typeof data === 'string' 
      ? new TextEncoder().encode(data).length 
      : data.byteLength;
    this.stats.bytesSent += bytes;
    this.stats.messagesSent++;
  }

  private updateReceivedStats(data: ArrayBuffer | string): void {
    const bytes = typeof data === 'string' 
      ? new TextEncoder().encode(data).length 
      : data.byteLength;
    this.stats.bytesReceived += bytes;
    this.stats.messagesReceived++;
  }

  private notifyStateChange(state: RTCDataChannelState): void {
    this.stateHandlers.forEach(handler => handler(state));
  }
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
