/**
 * Enhanced Unified Logging System
 * 
 * Provides comprehensive logging across:
 * - Browser console (with colors and grouping)
 * - In-app UI display
 * - Netlify function logs (via correlation IDs)
 * - Message delivery tracking
 * 
 * Log Format: [TIMESTAMP] [LEVEL] [SOURCE] Message
 * Example: [2025-12-28T04:10:00.000Z] [INFO] [MESH] Connecting to peer...
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogSource =
  | 'MESH'           // Mesh network operations
  | 'ROOM'           // Room system operations  
  | 'WEBRTC'         // WebRTC transport
  | 'MESSAGE'        // Message delivery
  | 'SIGNAL'         // Signaling operations
  | 'APP'            // Application level
  | 'TRANSPORT'      // Transport layer
  | 'ROUTING'        // Routing operations
  | 'RELAY'          // Message relay
  | 'POLL'           // Room polling
  | 'SEND'           // Message sending
  | 'RECV'           // Message receiving;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  data?: any;
  correlationId?: string;
}

// In-app log store for UI display
let inAppLogs: LogEntry[] = [];
const MAX_IN_APP_LOGS = 100;

// Re-export LogEntry for external use
export type { LogEntry };
// Callback for UI to subscribe to logs
type LogCallback = (entry: LogEntry) => void;
const logCallbacks: LogCallback[] = [];

export function subscribeToLogs(callback: LogCallback): () => void {
  logCallbacks.push(callback);
  return () => {
    const idx = logCallbacks.indexOf(callback);
    if (idx > -1) logCallbacks.splice(idx, 1);
  };
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

function getSourceColor(source: LogSource): string {
  const colors = {
    'MESH': '#4CAF50',     // Green
    'ROOM': '#2196F3',     // Blue  
    'WEBRTC': '#FF9800',   // Orange
    'MESSAGE': '#9C27B0',  // Purple
    'SIGNAL': '#00BCD4',   // Cyan
    'APP': '#607D8B',      // Blue Grey
    'TRANSPORT': '#795548', // Brown
    'ROUTING': '#FF5722',  // Deep Orange
    'RELAY': '#E91E63',    // Pink
    'POLL': '#009688',     // Teal
    'SEND': '#8BC34A',     // Light Green
    'RECV': '#FFC107',     // Amber
  };
  return colors[source] || '#9E9E9E';
}

function getLevelStyle(level: LogLevel): string {
  const styles = {
    'DEBUG': 'color: #9E9E9E; font-weight: normal;',
    'INFO': 'color: #2196F3; font-weight: bold;',
    'WARN': 'color: #FF9800; font-weight: bold;',
    'ERROR': 'color: #F44336; font-weight: bold;',
  };
  return styles[level] || 'color: #000;';
}

function formatConsoleMessage(entry: LogEntry): void {
  const sourceColor = getSourceColor(entry.source);
  const levelStyle = getLevelStyle(entry.level);
  
  // Main message with styling
  const mainMessage = `%c[${entry.timestamp}] %c[${entry.level}] %c[${entry.source}] %c${entry.message}`;
  const styles = [
    'color: #666; font-size: 11px;',
    levelStyle,
    `color: ${sourceColor}; font-weight: bold;`,
    'color: #333; font-weight: normal;',
  ];
  
  // Choose console method based on level
  const consoleMethod = entry.level === 'ERROR' ? 'error' : 
                        entry.level === 'WARN' ? 'warn' : 
                        entry.level === 'DEBUG' ? 'debug' : 'log';
  
  // Log the main message
  console[consoleMethod](mainMessage, ...styles);
  
  // Log additional data if present
  if (entry.data && Object.keys(entry.data).length > 0) {
    console.groupCollapsed(`%c📊 Data for ${entry.source} ${entry.message}`, `color: ${sourceColor};`);
    console.log('Data:', entry.data);
    if (entry.correlationId) {
      console.log('Correlation ID:', entry.correlationId);
    }
    console.groupEnd();
  }
}

function notifyCallbacks(entry: LogEntry): void {
  // Enhanced console output
  formatConsoleMessage(entry);
  
  // Add to in-app store
  inAppLogs.unshift(entry);
  if (inAppLogs.length > MAX_IN_APP_LOGS) {
    inAppLogs = inAppLogs.slice(0, MAX_IN_APP_LOGS);
  }
  
  // Notify subscribers
  logCallbacks.forEach(cb => cb(entry));
}

export function getInAppLogs(): LogEntry[] {
  return [...inAppLogs];
}

export function clearInAppLogs(): void {
  inAppLogs = [];
}

function createLogEntry(
  level: LogLevel,
  source: LogSource,
  message: string,
  data?: any,
  correlationId?: string
): LogEntry {
  return {
    timestamp: formatTimestamp(),
    level,
    source,
    message,
    data,
    correlationId,
  };
}

// Core logging functions
export function log(
  level: LogLevel,
  source: LogSource,
  message: string,
  data?: any,
  correlationId?: string
): LogEntry {
  const entry = createLogEntry(level, source, message, data, correlationId);
  
  // Console output with formatted message
  const formattedMessage = formatMessage(source, message);
  const consoleMessage = `[${entry.timestamp}] [${level}] ${formattedMessage}`;
  
  switch (level) {
    case 'DEBUG':
      console.debug(consoleMessage, data || '');
      break;
    case 'INFO':
      console.info(consoleMessage, data || '');
      break;
    case 'WARN':
      console.warn(consoleMessage, data || '');
      break;
    case 'ERROR':
      console.error(consoleMessage, data || '');
      break;
  }
  
  notifyCallbacks(entry);
  return entry;
}

// Convenience methods
export function debug(source: LogSource, message: string, data?: any, correlationId?: string) {
  return log('DEBUG', source, message, data, correlationId);
}

export function info(source: LogSource, message: string, data?: any, correlationId?: string) {
  return log('INFO', source, message, data, correlationId);
}

export function warn(source: LogSource, message: string, data?: any, correlationId?: string) {
  return log('WARN', source, message, data, correlationId);
}

export function error(source: LogSource, message: string, data?: any, correlationId?: string) {
  return log('ERROR', source, message, data, correlationId);
}

// Specific loggers for each source
export const meshNetworkLogger = {
  debug: (msg: string, data?: any) => log('DEBUG', 'MeshNetwork', msg, data),
  info: (msg: string, data?: any) => log('INFO', 'MeshNetwork', msg, data),
  warn: (msg: string, data?: any) => log('WARN', 'MeshNetwork', msg, data),
  error: (msg: string, data?: any) => log('ERROR', 'MeshNetwork', msg, data),
};

export const webrtcTransportLogger = {
  debug: (msg: string, data?: any) => log('DEBUG', 'WebRTCTransport', msg, data),
  info: (msg: string, data?: any) => log('INFO', 'WebRTCTransport', msg, data),
  warn: (msg: string, data?: any) => log('WARN', 'WebRTCTransport', msg, data),
  error: (msg: string, data?: any) => log('ERROR', 'WebRTCTransport', msg, data),
};

export const useMeshNetworkLogger = {
  debug: (msg: string, data?: any) => log('DEBUG', 'useMeshNetwork', msg, data),
  info: (msg: string, data?: any) => log('INFO', 'useMeshNetwork', msg, data),
  warn: (msg: string, data?: any) => log('WARN', 'useMeshNetwork', msg, data),
  error: (msg: string, data?: any) => log('ERROR', 'useMeshNetwork', msg, data),
};

export const roomClientLogger = {
  debug: (msg: string, data?: any) => log('DEBUG', 'RoomClient', msg, data),
  info: (msg: string, data?: any) => log('INFO', 'RoomClient', msg, data),
  warn: (msg: string, data?: any) => log('WARN', 'RoomClient', msg, data),
  error: (msg: string, data?: any) => log('ERROR', 'RoomClient', msg, data),
};

export const signalingLogger = {
  debug: (msg: string, data?: any) => log('DEBUG', 'Signaling', msg, data),
  info: (msg: string, data?: any) => log('INFO', 'Signaling', msg, data),
  warn: (msg: string, data?: any) => log('WARN', 'Signaling', msg, data),
  error: (msg: string, data?: any) => log('ERROR', 'Signaling', msg, data),
};

export const appLogger = {
  debug: (msg: string, data?: any) => log('DEBUG', 'App', msg, data),
  info: (msg: string, data?: any) => log('INFO', 'App', msg, data),
  warn: (msg: string, data?: any) => log('WARN', 'App', msg, data),
  error: (msg: string, data?: any) => log('ERROR', 'App', msg, data),
};

// Export for Netlify functions (Node.js compatible)
export function createNetlifyLogger(requestId: string) {
  return {
    debug: (source: LogSource, message: string, data?: any) => {
      const entry = createLogEntry('DEBUG', source, message, data, requestId);
      console.log(`[${entry.timestamp}] [${requestId}] [DEBUG] [${source}] ${message}`, data || '');
    },
    info: (source: LogSource, message: string, data?: any) => {
      const entry = createLogEntry('INFO', source, message, data, requestId);
      console.log(`[${entry.timestamp}] [${requestId}] [INFO] [${source}] ${message}`, data || '');
    },
    warn: (source: LogSource, message: string, data?: any) => {
      const entry = createLogEntry('WARN', source, message, data, requestId);
      console.warn(`[${entry.timestamp}] [${requestId}] [WARN] [${source}] ${message}`, data || '');
    },
    error: (source: LogSource, message: string, data?: any) => {
      const entry = createLogEntry('ERROR', source, message, data, requestId);
      console.error(`[${entry.timestamp}] [${requestId}] [ERROR] [${source}] ${message}`, data || '');
    },
    logAction: (action: string, peerId: string, extra?: any) => {
      const entry = createLogEntry('INFO', 'RoomFunction', `Action: ${action}, PeerId: ${peerId}`, extra, requestId);
      console.log(`[${entry.timestamp}] [${requestId}] [INFO] [RoomFunction] Action: ${action}, PeerId: ${peerId}`, extra || '');
    },
  };
}
