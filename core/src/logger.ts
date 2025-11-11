/**
 * Structured Logging System
 * Task 167: Implement comprehensive logging
 * 
 * Provides structured logging with levels, categories, and persistence
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export enum LogCategory {
  NETWORK = 'network',
  CRYPTO = 'crypto',
  MESH = 'mesh',
  BLE = 'ble',
  WEBRTC = 'webrtc',
  STORAGE = 'storage',
  UI = 'ui',
  SYSTEM = 'system'
}

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  context?: Record<string, any>;
}

export interface LogFilter {
  level?: LogLevel;
  category?: LogCategory;
  startTime?: number;
  endTime?: number;
  search?: string;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 10000;
  private minLevel: LogLevel = LogLevel.INFO;
  private enabled = true;
  private consoleOutput = true;
  private listeners: ((entry: LogEntry) => void)[] = [];
  
  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
  
  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Enable/disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.consoleOutput = enabled;
  }
  
  /**
   * Add log listener
   */
  addListener(listener: (entry: LogEntry) => void): void {
    this.listeners.push(listener);
  }
  
  /**
   * Log debug message
   */
  debug(category: LogCategory, message: string, data?: any, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, category, message, data, context);
  }
  
  /**
   * Log info message
   */
  info(category: LogCategory, message: string, data?: any, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, category, message, data, context);
  }
  
  /**
   * Log warning message
   */
  warn(category: LogCategory, message: string, data?: any, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, category, message, data, context);
  }
  
  /**
   * Log error message
   */
  error(category: LogCategory, message: string, data?: any, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, category, message, data, context);
  }
  
  /**
   * Log critical message
   */
  critical(category: LogCategory, message: string, data?: any, context?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, category, message, data, context);
  }
  
  /**
   * Internal log method
   */
  private log(
    level: LogLevel, 
    category: LogCategory, 
    message: string, 
    data?: any, 
    context?: Record<string, any>
  ): void {
    if (!this.enabled || level < this.minLevel) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
      context
    };
    
    // Store log
    this.logs.push(entry);
    
    // Trim logs if needed
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console output
    if (this.consoleOutput) {
      this.outputToConsole(entry);
    }
    
    // Notify listeners
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (e) {
        console.error('Log listener error:', e);
      }
    });
  }
  
  /**
   * Output to console with appropriate styling
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${LogLevel[entry.level]}] [${entry.category}]`;
    
    const style = this.getConsoleStyle(entry.level);
    
    if (entry.data) {
      console.log(`%c${prefix}%c ${entry.message}`, style, '', entry.data);
    } else {
      console.log(`%c${prefix}%c ${entry.message}`, style, '');
    }
  }
  
  /**
   * Get console style for log level
   */
  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'color: gray';
      case LogLevel.INFO:
        return 'color: blue';
      case LogLevel.WARN:
        return 'color: orange; font-weight: bold';
      case LogLevel.ERROR:
        return 'color: red; font-weight: bold';
      case LogLevel.CRITICAL:
        return 'color: white; background-color: red; font-weight: bold; padding: 2px 4px';
      default:
        return '';
    }
  }
  
  /**
   * Query logs with filter
   */
  query(filter?: LogFilter): LogEntry[] {
    let results = this.logs;
    
    if (!filter) {
      return results;
    }
    
    if (filter.level !== undefined) {
      results = results.filter(entry => entry.level >= filter.level!);
    }
    
    if (filter.category) {
      results = results.filter(entry => entry.category === filter.category);
    }
    
    if (filter.startTime) {
      results = results.filter(entry => entry.timestamp >= filter.startTime!);
    }
    
    if (filter.endTime) {
      results = results.filter(entry => entry.timestamp <= filter.endTime!);
    }
    
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      results = results.filter(entry => 
        entry.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(entry.data).toLowerCase().includes(searchLower)
      );
    }
    
    return results;
  }
  
  /**
   * Export logs to JSON
   */
  export(filter?: LogFilter): string {
    const entries = this.query(filter);
    return JSON.stringify(entries, null, 2);
  }
  
  /**
   * Export logs to CSV
   */
  exportCSV(filter?: LogFilter): string {
    const entries = this.query(filter);
    
    const header = 'Timestamp,Level,Category,Message,Data\n';
    const rows = entries.map(entry => {
      const timestamp = new Date(entry.timestamp).toISOString();
      const level = LogLevel[entry.level];
      const category = entry.category;
      const message = `"${entry.message.replace(/"/g, '""')}"`;
      const data = entry.data ? `"${JSON.stringify(entry.data).replace(/"/g, '""')}"` : '';
      
      return `${timestamp},${level},${category},${message},${data}`;
    }).join('\n');
    
    return header + rows;
  }
  
  /**
   * Clear logs
   */
  clear(): void {
    this.logs = [];
  }
  
  /**
   * Get statistics
   */
  getStatistics(): Record<string, any> {
    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    
    this.logs.forEach(entry => {
      const level = LogLevel[entry.level];
      const category = entry.category;
      
      byLevel[level] = (byLevel[level] || 0) + 1;
      byCategory[category] = (byCategory[category] || 0) + 1;
    });
    
    return {
      total: this.logs.length,
      byLevel,
      byCategory,
      timeRange: {
        start: this.logs.length > 0 ? this.logs[0].timestamp : null,
        end: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
      }
    };
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();
