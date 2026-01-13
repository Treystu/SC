/**
 * Unified logging system types
 * Single source of truth for all logging-related interfaces
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
  error?: Error;
  stack?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  maxEntries: number;
  enableConsole: boolean;
  enableStorage: boolean;
  enableRemote: boolean;
  remoteEndpoint?: string;
  format: 'json' | 'text';
  colors: boolean;
}

export interface LoggerMetrics {
  totalLogs: number;
  logsByLevel: Record<LogLevel, number>;
  errorsLogged: number;
  averageLogSize: number;
  oldestLogTimestamp: number;
  newestLogTimestamp: number;
}

export interface LogFilter {
  level?: LogLevel;
  module?: string;
  startTime?: number;
  endTime?: number;
  search?: string;
}

export interface LogExportOptions {
  format: 'json' | 'csv' | 'txt';
  includeMetadata: boolean;
  compress: boolean;
  filter?: LogFilter;
}
