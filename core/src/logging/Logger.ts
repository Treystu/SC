/**
 * Unified Logger
 * Consolidates functionality from logging.ts and logger.ts
 * Single source of truth for all logging operations
 */

import { LogLevel, type LogEntry, type LoggerConfig, type LoggerMetrics, type LogFilter, type LogExportOptions } from '../types/logging';

/**
 * Unified logging system with comprehensive features
 */
export class Logger {
  private logs: LogEntry[] = [];
  private config: LoggerConfig;
  private module?: string;
  private metrics: LoggerMetrics;

  constructor(config?: Partial<LoggerConfig>, module?: string) {
    this.config = {
      minLevel: LogLevel.INFO,
      maxEntries: 1000,
      enableConsole: true,
      enableStorage: true,
      enableRemote: false,
      format: 'text',
      colors: true,
      ...config
    };
    this.module = module;
    this.metrics = this.initializeMetrics();
  }

  /**
   * Log a debug message
   */
  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log an info message
   */
  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, data?: unknown): void {
    this.log(LogLevel.ERROR, message, data, error);
  }

  /**
   * Log a fatal message
   */
  fatal(message: string, error?: Error, data?: unknown): void {
    this.log(LogLevel.FATAL, message, data, error);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: unknown, error?: Error): void {
    if (level < this.config.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      module: this.module,
      data,
      error,
      stack: error?.stack
    };

    // Add to internal storage
    if (this.config.enableStorage) {
      this.addLogEntry(entry);
    }

    // Output to console
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // Send to remote endpoint
    if (this.config.enableRemote && this.config.remoteEndpoint) {
      this.sendToRemote(entry);
    }

    // Update metrics
    this.updateMetrics(entry);
  }

  /**
   * Add log entry to internal storage
   */
  private addLogEntry(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Maintain max entries limit
    if (this.logs.length > this.config.maxEntries) {
      this.logs.shift();
    }
  }

  /**
   * Output to console with formatting
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = LogLevel[entry.level];
    const module = entry.module ? `[${entry.module}]` : '';
    const message = `${timestamp} ${levelName} ${module} ${entry.message}`;

    if (this.config.format === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(message, entry.data);
          break;
        case LogLevel.INFO:
          console.info(message, entry.data);
          break;
        case LogLevel.WARN:
          console.warn(message, entry.data);
          break;
        case LogLevel.ERROR:
          console.error(message, entry.error || entry.data);
          break;
        case LogLevel.FATAL:
          console.error(message, entry.error || entry.data);
          break;
      }
    }
  }

  /**
   * Send log to remote endpoint
   */
  private async sendToRemote(entry: LogEntry): Promise<void> {
    if (!this.config.remoteEndpoint) return;

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      // Avoid infinite loop of error logging
      console.error('Failed to send log to remote endpoint:', error);
    }
  }

  /**
   * Update logger metrics
   */
  private updateMetrics(entry: LogEntry): void {
    this.metrics.totalLogs++;
    this.metrics.logsByLevel[entry.level] = (this.metrics.logsByLevel[entry.level] || 0) + 1;
    
    if (entry.level >= LogLevel.ERROR) {
      this.metrics.errorsLogged++;
    }

    const logSize = JSON.stringify(entry).length;
    this.metrics.averageLogSize = 
      (this.metrics.averageLogSize * (this.metrics.totalLogs - 1) + logSize) / this.metrics.totalLogs;

    this.metrics.newestLogTimestamp = entry.timestamp;
    if (this.metrics.oldestLogTimestamp === 0) {
      this.metrics.oldestLogTimestamp = entry.timestamp;
    }
  }

  /**
   * Initialize metrics
   */
  private initializeMetrics(): LoggerMetrics {
    return {
      totalLogs: 0,
      logsByLevel: {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0,
        [LogLevel.FATAL]: 0,
      },
      errorsLogged: 0,
      averageLogSize: 0,
      oldestLogTimestamp: 0,
      newestLogTimestamp: 0,
    };
  }

  /**
   * Get all logs
   */
  getLogs(filter?: LogFilter): LogEntry[] {
    let filteredLogs = [...this.logs];

    if (filter) {
      const { level, module, startTime, endTime, search } = filter;

      if (typeof level === 'number') {
        filteredLogs = filteredLogs.filter(log => log.level >= level);
      }
      if (module) {
        filteredLogs = filteredLogs.filter(log => log.module === module);
      }
      if (typeof startTime === 'number') {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= startTime);
      }
      if (typeof endTime === 'number') {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= endTime);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        filteredLogs = filteredLogs.filter(log => 
          log.message.toLowerCase().includes(searchLower) ||
          (log.module && log.module.toLowerCase().includes(searchLower))
        );
      }
    }

    return filteredLogs;
  }

  /**
   * Get logger metrics
   */
  getMetrics(): LoggerMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = [];
    this.metrics = this.initializeMetrics();
  }

  /**
   * Export logs
   */
  async exportLogs(options: LogExportOptions): Promise<string> {
    const logs = this.getLogs(options.filter);
    
    switch (options.format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      case 'csv':
        return this.exportToCSV(logs, options.includeMetadata);
      case 'txt':
        return this.exportToText(logs, options.includeMetadata);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  /**
   * Export logs to CSV format
   */
  private exportToCSV(logs: LogEntry[], includeMetadata: boolean): string {
    const headers = includeMetadata 
      ? 'timestamp,level,module,message,data,error,stack'
      : 'timestamp,level,module,message';
    
    const rows = logs.map(log => {
      const data = includeMetadata 
        ? `"${log.timestamp}","${LogLevel[log.level]}","${log.module || ''}","${log.message}","${JSON.stringify(log.data || '')}","${log.error?.message || ''}","${log.stack || ''}"`
        : `"${log.timestamp}","${LogLevel[log.level]}","${log.module || ''}","${log.message}"`;
      return data;
    });

    return [headers, ...rows].join('\n');
  }

  /**
   * Export logs to text format
   */
  private exportToText(logs: LogEntry[], includeMetadata: boolean): string {
    return logs.map(log => {
      const timestamp = new Date(log.timestamp).toISOString();
      const level = LogLevel[log.level];
      const module = log.module ? `[${log.module}]` : '';
      const metadata = includeMetadata && log.data ? ` ${JSON.stringify(log.data)}` : '';
      const error = includeMetadata && log.error ? `\nError: ${log.error.message}` : '';
      
      return `${timestamp} ${level} ${module} ${log.message}${metadata}${error}`;
    }).join('\n');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

// Global logger instance
export const logger = new Logger();

// Create module-specific loggers
export const createLogger = (module: string, config?: Partial<LoggerConfig>): Logger => {
  return new Logger(config, module);
};
