/**
 * Logger - Structured logging system
 * Task 182: Logging and debugging utilities
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  module?: string;
  data?: Record<string, any>;
  userId?: string;
  sessionId?: string;
}

export class Logger {
  private static instance: Logger;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize = 5000;
  private currentLevel: LogLevel = LogLevel.INFO;
  private moduleFilters: Set<string> = new Set();

  private constructor() {
    // Check environment for log level
    if (typeof process !== 'undefined' && process.env.LOG_LEVEL) {
      this.setLevel(process.env.LOG_LEVEL as LogLevel);
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Enable logging for specific modules
   */
  enableModule(module: string): void {
    this.moduleFilters.add(module);
  }

  /**
   * Disable logging for specific modules
   */
  disableModule(module: string): void {
    this.moduleFilters.delete(module);
  }

  /**
   * Check if level should be logged
   */
  private shouldLog(level: LogLevel, module?: string): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentIndex = levels.indexOf(this.currentLevel);
    const messageIndex = levels.indexOf(level);

    if (messageIndex < currentIndex) {
      return false;
    }

    if (module && this.moduleFilters.size > 0) {
      return this.moduleFilters.has(module);
    }

    return true;
  }

  /**
   * Create log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    module?: string,
    data?: Record<string, any>
  ): LogEntry {
    return {
      level,
      message,
      timestamp: Date.now(),
      module,
      data,
      userId: this.getCurrentUserId(),
      sessionId: this.getSessionId()
    };
  }

  /**
   * Get current user ID (if available)
   */
  private getCurrentUserId(): string | undefined {
    if (typeof window !== 'undefined' && (window as any).SC_USER_ID) {
      return (window as any).SC_USER_ID;
    }
    return undefined;
  }

  /**
   * Get session ID
   */
  private getSessionId(): string | undefined {
    if (typeof window !== 'undefined' && (window as any).SC_SESSION_ID) {
      return (window as any).SC_SESSION_ID;
    }
    return undefined;
  }

  /**
   * Add entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);

    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }
  }

  /**
   * Format log message for console
   */
  private formatMessage(entry: LogEntry): any[] {
    const timestamp = new Date(entry.timestamp).toISOString();
    const module = entry.module ? `[${entry.module}]` : '';
    const level = `[${entry.level.toUpperCase()}]`;
    
    const parts = [timestamp, level, module, entry.message].filter(Boolean);
    
    if (entry.data) {
      return [parts.join(' '), entry.data];
    }
    
    return [parts.join(' ')];
  }

  /**
   * Write to console
   */
  private writeToConsole(entry: LogEntry): void {
    const formatted = this.formatMessage(entry);
    
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(...formatted);
        break;
      case LogLevel.WARN:
        console.warn(...formatted);
        break;
      case LogLevel.DEBUG:
        console.debug(...formatted);
        break;
      default:
        console.log(...formatted);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, module?: string, data?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG, module)) return;
    
    const entry = this.createEntry(LogLevel.DEBUG, message, module, data);
    this.addToBuffer(entry);
    this.writeToConsole(entry);
  }

  /**
   * Log info message
   */
  info(message: string, module?: string, data?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO, module)) return;
    
    const entry = this.createEntry(LogLevel.INFO, message, module, data);
    this.addToBuffer(entry);
    this.writeToConsole(entry);
  }

  /**
   * Log warning message
   */
  warn(message: string, module?: string, data?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN, module)) return;
    
    const entry = this.createEntry(LogLevel.WARN, message, module, data);
    this.addToBuffer(entry);
    this.writeToConsole(entry);
  }

  /**
   * Log error message
   */
  error(message: string, module?: string, data?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR, module)) return;
    
    const entry = this.createEntry(LogLevel.ERROR, message, module, data);
    this.addToBuffer(entry);
    this.writeToConsole(entry);
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit: number = 100): LogEntry[] {
    return this.logBuffer.slice(-limit);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logBuffer.filter(entry => entry.level === level);
  }

  /**
   * Get logs by module
   */
  getLogsByModule(module: string): LogEntry[] {
    return this.logBuffer.filter(entry => entry.module === module);
  }

  /**
   * Get logs in time range
   */
  getLogsByTimeRange(startTime: number, endTime: number): LogEntry[] {
    return this.logBuffer.filter(
      entry => entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Clear log buffer
   */
  clearLogs(): void {
    this.logBuffer = [];
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }

  /**
   * Get log statistics
   */
  getStats(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    byModule: Record<string, number>;
  } {
    const stats = {
      total: this.logBuffer.length,
      byLevel: {} as Record<LogLevel, number>,
      byModule: {} as Record<string, number>
    };

    // Initialize level counters
    Object.values(LogLevel).forEach(level => {
      stats.byLevel[level as LogLevel] = 0;
    });

    // Count occurrences
    this.logBuffer.forEach(entry => {
      stats.byLevel[entry.level]++;
      
      if (entry.module) {
        stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1;
      }
    });

    return stats;
  }
}

// Global logger instance
export const logger = Logger.getInstance();

// Convenience exports for module-specific loggers
export const createModuleLogger = (moduleName: string) => ({
  debug: (message: string, data?: Record<string, any>) => 
    logger.debug(message, moduleName, data),
  info: (message: string, data?: Record<string, any>) => 
    logger.info(message, moduleName, data),
  warn: (message: string, data?: Record<string, any>) => 
    logger.warn(message, moduleName, data),
  error: (message: string, data?: Record<string, any>) => 
    logger.error(message, moduleName, data)
});
