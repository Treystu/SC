// Advanced logging system with privacy-preserving features

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
  category?: string;
}

export class AdvancedLogger {
  private logs: LogEntry[] = [];
  private readonly maxLogSize = 1000;
  private minLevel: LogLevel = LogLevel.INFO;
  private categories: Set<string> = new Set();
  
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }
  
  enableCategory(category: string): void {
    this.categories.add(category);
  }
  
  disableCategory(category: string): void {
    this.categories.delete(category);
  }
  
  log(level: LogLevel, message: string, context?: Record<string, any>, category?: string): void {
    if (level < this.minLevel) return;
    if (category && this.categories.size > 0 && !this.categories.has(category)) return;
    
    const entry: LogEntry = {
      level,
      message: this.sanitizeMessage(message),
      timestamp: Date.now(),
      context: context ? this.sanitizeContext(context) : undefined,
      category
    };
    
    this.logs.push(entry);
    
    if (this.logs.length > this.maxLogSize) {
      this.logs.shift();
    }
    
    this.outputLog(entry);
  }
  
  private sanitizeMessage(message: string): string {
    // Remove potential PII (peer IDs, IP addresses, etc.)
    return message
      .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]')
      .replace(/[0-9a-f]{40,}/gi, '[HASH]');
  }
  
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitizeMessage(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  private outputLog(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const time = new Date(entry.timestamp).toISOString();
    const category = entry.category ? `[${entry.category}]` : '';
    
    const output = `${time} ${levelName} ${category} ${entry.message}`;
    
    switch (entry.level) {
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(output, entry.context);
        break;
      case LogLevel.WARN:
        console.warn(output, entry.context);
        break;
      default:
        console.log(output, entry.context);
    }
  }
  
  debug(message: string, context?: Record<string, any>, category?: string): void {
    this.log(LogLevel.DEBUG, message, context, category);
  }
  
  info(message: string, context?: Record<string, any>, category?: string): void {
    this.log(LogLevel.INFO, message, context, category);
  }
  
  warn(message: string, context?: Record<string, any>, category?: string): void {
    this.log(LogLevel.WARN, message, context, category);
  }
  
  error(message: string, context?: Record<string, any>, category?: string): void {
    this.log(LogLevel.ERROR, message, context, category);
  }
  
  critical(message: string, context?: Record<string, any>, category?: string): void {
    this.log(LogLevel.CRITICAL, message, context, category);
  }
  
  getLogs(level?: LogLevel, category?: string): LogEntry[] {
    let filtered = this.logs;
    
    if (level !== undefined) {
      filtered = filtered.filter(entry => entry.level >= level);
    }
    
    if (category) {
      filtered = filtered.filter(entry => entry.category === category);
    }
    
    return filtered;
  }
  
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
  
  clearLogs(): void {
    this.logs = [];
  }
}

export const logger = new AdvancedLogger();
