/**
 * Comprehensive logging framework with levels and rotation
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  message: string;
  module?: string;
  data?: any;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  maxEntries: number;
  enableConsole: boolean;
  enableStorage: boolean;
}

export class Logger {
  private logs: LogEntry[] = [];
  private config: LoggerConfig;
  private module?: string;

  constructor(config: Partial<LoggerConfig> = {}, module?: string) {
    this.config = {
      minLevel: config.minLevel ?? LogLevel.INFO,
      maxEntries: config.maxEntries ?? 10000,
      enableConsole: config.enableConsole ?? true,
      enableStorage: config.enableStorage ?? false
    };
    this.module = module;
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  fatal(message: string, data?: any): void {
    this.log(LogLevel.FATAL, message, data);
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level < this.config.minLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      module: this.module,
      data
    };

    this.logs.push(entry);

    // Rotate logs if exceeded max
    if (this.logs.length > this.config.maxEntries) {
      this.logs.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }

    // Storage (can be implemented per platform)
    if (this.config.enableStorage) {
      this.outputToStorage(entry);
    }
  }

  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${this.getLevelName(entry.level)}] ${new Date(entry.timestamp).toISOString()}`;
    const modulePrefix = entry.module ? `[${entry.module}]` : '';
    const fullMessage = `${prefix} ${modulePrefix} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(fullMessage, entry.data || '');
        break;
      case LogLevel.INFO:
        console.info(fullMessage, entry.data || '');
        break;
      case LogLevel.WARN:
        console.warn(fullMessage, entry.data || '');
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(fullMessage, entry.data || '');
        break;
    }
  }

  private outputToStorage(entry: LogEntry): void {
    // Platform-specific storage implementation
    // Can be overridden by platform-specific logger
  }

  private getLevelName(level: LogLevel): string {
    return LogLevel[level];
  }

  getLogs(options?: {
    level?: LogLevel;
    module?: string;
    since?: number;
    limit?: number;
  }): LogEntry[] {
    let filtered = this.logs;

    if (options?.level !== undefined) {
      filtered = filtered.filter(e => e.level === options.level);
    }
    if (options?.module) {
      filtered = filtered.filter(e => e.module === options.module);
    }
    if (options?.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }
    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  clear(): void {
    this.logs = [];
  }

  setLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  getStats(): {
    total: number;
    byLevel: Record<string, number>;
    oldestTimestamp?: number;
    newestTimestamp?: number;
  } {
    const stats: any = {
      total: this.logs.length,
      byLevel: {}
    };

    for (const entry of this.logs) {
      const levelName = this.getLevelName(entry.level);
      stats.byLevel[levelName] = (stats.byLevel[levelName] || 0) + 1;
    }

    if (this.logs.length > 0) {
      stats.oldestTimestamp = this.logs[0].timestamp;
      stats.newestTimestamp = this.logs[this.logs.length - 1].timestamp;
    }

    return stats;
  }

  export(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  import(data: string): void {
    try {
      const imported = JSON.parse(data);
      if (Array.isArray(imported)) {
        this.logs = imported;
      }
    } catch (error) {
      this.error('Failed to import logs', { error });
    }
  }
}

// Global logger instance
export const logger = new Logger();

// Create module-specific loggers
export const createLogger = (module: string, config?: Partial<LoggerConfig>): Logger => {
  return new Logger(config, module);
};
