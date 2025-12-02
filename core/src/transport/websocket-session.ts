/**
 * Enhanced WebSocket session management
 * Features: exponential backoff reconnect, heartbeat monitoring, 
 * browser online/offline handling, and message queuing
 */

type MessageHandler = (data: unknown) => void;
type ErrorHandler = (error: Event | Error) => void;
type StateChangeHandler = (state: WebSocketSessionState) => void;

export enum WebSocketSessionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed'
}

export interface WebSocketSessionConfig {
  url: string;
  /** Base reconnect interval in ms (default: 1000) */
  reconnectInterval?: number;
  /** Maximum reconnect interval in ms (default: 30000) */
  maxReconnectInterval?: number;
  /** Maximum reconnect attempts before giving up (default: 10) */
  maxReconnectAttempts?: number;
  /** Heartbeat ping interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Heartbeat timeout - close connection if no pong received (default: 10000) */
  heartbeatTimeout?: number;
  /** Maximum messages to queue while disconnected (default: 100) */
  maxQueueSize?: number;
  /** Enable browser online/offline event handling (default: true) */
  handleOnlineOffline?: boolean;
  /** Protocol subprotocols */
  protocols?: string | string[];
}

interface QueuedMessage {
  data: unknown;
  timestamp: number;
  retryCount: number;
}

export class WebSocketSessionEnhanced {
  private ws: WebSocket | null = null;
  private config: Required<Omit<WebSocketSessionConfig, 'protocols'>> & { protocols?: string | string[] };
  private state: WebSocketSessionState = WebSocketSessionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPongTime = 0;
  private messageHandlers = new Set<MessageHandler>();
  private errorHandlers = new Set<ErrorHandler>();
  private stateChangeHandlers = new Set<StateChangeHandler>();
  private messageQueue: QueuedMessage[] = [];
  private isManualClose = false;
  private onlineHandler: (() => void) | null = null;
  private offlineHandler: (() => void) | null = null;

  constructor(config: WebSocketSessionConfig) {
    this.config = {
      url: config.url,
      reconnectInterval: config.reconnectInterval ?? 1000,
      maxReconnectInterval: config.maxReconnectInterval ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 10000,
      maxQueueSize: config.maxQueueSize ?? 100,
      handleOnlineOffline: config.handleOnlineOffline ?? true,
      protocols: config.protocols
    };

    if (this.config.handleOnlineOffline && typeof window !== 'undefined') {
      this.setupOnlineOfflineHandlers();
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || 
        this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.isManualClose = false;
    this.setState(WebSocketSessionState.CONNECTING);

    try {
      this.ws = this.config.protocols
        ? new WebSocket(this.config.url, this.config.protocols)
        : new WebSocket(this.config.url);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (error) {
      this.handleError(error as Event);
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.isManualClose = true;
    this.cleanup();
    this.setState(WebSocketSessionState.DISCONNECTED);
  }

  /**
   * Send data through the WebSocket
   * @returns true if sent, false if queued or failed
   */
  send(data: unknown): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        this.queueMessage(data);
        return false;
      }
    }

    this.queueMessage(data);
    return false;
  }

  /**
   * Send binary data
   */
  sendBinary(data: ArrayBuffer | Blob | Uint8Array): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(data);
        return true;
      } catch (error) {
        console.error('Failed to send binary WebSocket message:', error);
        return false;
      }
    }
    return false;
  }

  /**
   * Register a message handler
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Register an error handler
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Register a state change handler
   */
  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  getState(): WebSocketSessionState {
    return this.state;
  }

  /**
   * Get underlying WebSocket state
   */
  getWebSocketState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Get number of queued messages
   */
  getQueueLength(): number {
    return this.messageQueue.length;
  }

  /**
   * Get reconnection attempts count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Force a reconnection
   */
  reconnect(): void {
    this.cleanup();
    this.reconnectAttempts = 0;
    this.connect();
  }

  private handleOpen(): void {
    this.reconnectAttempts = 0;
    this.lastPongTime = Date.now();
    this.setState(WebSocketSessionState.CONNECTED);
    this.startHeartbeat();
    this.flushQueue();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = typeof event.data === 'string' 
        ? JSON.parse(event.data) 
        : event.data;

      // Handle pong messages for heartbeat
      if (data?.type === 'pong') {
        this.lastPongTime = Date.now();
        this.clearHeartbeatTimeout();
        return;
      }

      this.messageHandlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleError(error: Event): void {
    console.error('WebSocket error:', error);
    this.errorHandlers.forEach(handler => handler(error));
  }

  private handleClose(): void {
    this.stopHeartbeat();

    if (this.isManualClose) {
      this.setState(WebSocketSessionState.DISCONNECTED);
      return;
    }

    // Attempt reconnection
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.setState(WebSocketSessionState.RECONNECTING);
      this.scheduleReconnect();
    } else {
      this.setState(WebSocketSessionState.FAILED);
      this.errorHandlers.forEach(handler => 
        handler(new Error('Maximum reconnection attempts reached'))
      );
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 0.3 * baseDelay;
    const delay = Math.min(baseDelay + jitter, this.config.maxReconnectInterval);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
        this.startHeartbeatTimeout();
      }
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
      console.warn('Heartbeat timeout - connection may be dead');
      // Close connection to trigger reconnect
      if (this.ws) {
        this.ws.close();
      }
    }, this.config.heartbeatTimeout);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private queueMessage(data: unknown): void {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      // Remove oldest message
      this.messageQueue.shift();
    }

    this.messageQueue.push({
      data,
      timestamp: Date.now(),
      retryCount: 0
    });
  }

  private flushQueue(): void {
    const queue = [...this.messageQueue];
    this.messageQueue = [];

    for (const msg of queue) {
      if (!this.send(msg.data)) {
        // Re-queue failed messages
        msg.retryCount++;
        if (msg.retryCount < 3) {
          this.messageQueue.push(msg);
        }
      }
    }
  }

  private setState(newState: WebSocketSessionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateChangeHandlers.forEach(handler => handler(newState));
    }
  }

  private setupOnlineOfflineHandlers(): void {
    this.onlineHandler = () => {
      if (this.state === WebSocketSessionState.DISCONNECTED ||
          this.state === WebSocketSessionState.FAILED) {
        this.reconnectAttempts = 0;
        this.connect();
      }
    };

    this.offlineHandler = () => {
      // Don't attempt reconnect while offline
      this.clearReconnectTimer();
    };

    window.addEventListener('online', this.onlineHandler);
    window.addEventListener('offline', this.offlineHandler);
  }

  private cleanup(): void {
    this.stopHeartbeat();
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      
      if (this.ws.readyState === WebSocket.OPEN || 
          this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /**
   * Destroy the session and clean up all resources
   */
  destroy(): void {
    this.disconnect();
    this.messageHandlers.clear();
    this.errorHandlers.clear();
    this.stateChangeHandlers.clear();
    this.messageQueue = [];

    if (typeof window !== 'undefined') {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
      }
      if (this.offlineHandler) {
        window.removeEventListener('offline', this.offlineHandler);
      }
    }
  }
}
