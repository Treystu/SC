/**
 * Comprehensive error handling framework for Sovereign Communications
 */

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  CRYPTO = 'crypto',
  STORAGE = 'storage',
  PROTOCOL = 'protocol',
  BLE = 'ble',
  WEBRTC = 'webrtc',
  UI = 'ui',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown'
}

export interface ErrorDetails {
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  timestamp: number;
  context?: Record<string, any>;
  stack?: string;
  recoverable: boolean;
}

export class SCError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly timestamp: number;
  public readonly context?: Record<string, any>;
  public readonly recoverable: boolean;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = 'SCError';
    this.code = details.code;
    this.category = details.category;
    this.severity = details.severity;
    this.timestamp = details.timestamp;
    this.context = details.context;
    this.recoverable = details.recoverable;

    if (details.stack) {
      this.stack = details.stack;
    }
  }

  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
      recoverable: this.recoverable
    };
  }
}

export type ErrorHandler = (error: SCError) => void | Promise<void>;

export class ErrorManager {
  private handlers: Map<ErrorCategory, ErrorHandler[]> = new Map();
  private globalHandlers: ErrorHandler[] = [];
  private errorLog: SCError[] = [];
  private readonly maxLogSize = 1000;

  registerHandler(category: ErrorCategory, handler: ErrorHandler): void {
    if (!this.handlers.has(category)) {
      this.handlers.set(category, []);
    }
    this.handlers.get(category)!.push(handler);
  }

  registerGlobalHandler(handler: ErrorHandler): void {
    this.globalHandlers.push(handler);
  }

  async handle(error: Error | SCError): Promise<void> {
    const scError = error instanceof SCError 
      ? error 
      : this.convertToSCError(error);

    // Log the error
    this.logError(scError);

    // Call category-specific handlers
    const categoryHandlers = this.handlers.get(scError.category) || [];
    for (const handler of categoryHandlers) {
      try {
        await handler(scError);
      } catch (handlerError) {
        console.error('Error handler failed:', handlerError);
      }
    }

    // Call global handlers
    for (const handler of this.globalHandlers) {
      try {
        await handler(scError);
      } catch (handlerError) {
        console.error('Global error handler failed:', handlerError);
      }
    }
  }

  private convertToSCError(error: Error): SCError {
    return new SCError({
      code: 'UNKNOWN_ERROR',
      message: error.message,
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now(),
      stack: error.stack,
      recoverable: false,
      context: { originalError: error.name }
    });
  }

  private logError(error: SCError): void {
    this.errorLog.push(error);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }

  getErrors(options?: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    since?: number;
    limit?: number;
  }): SCError[] {
    let filtered = this.errorLog;

    if (options?.category) {
      filtered = filtered.filter(e => e.category === options.category);
    }
    if (options?.severity) {
      filtered = filtered.filter(e => e.severity === options.severity);
    }
    if (options?.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }
    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  clearErrors(): void {
    this.errorLog = [];
  }

  getErrorStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
  } {
    const stats = {
      total: this.errorLog.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>
    };

    for (const error of this.errorLog) {
      stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    }

    return stats;
  }
}

// Singleton instance
export const errorManager = new ErrorManager();

// Common error factories
export const createNetworkError = (message: string, context?: any): SCError => 
  new SCError({
    code: 'NETWORK_ERROR',
    message,
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    timestamp: Date.now(),
    context,
    recoverable: true
  });

export const createCryptoError = (message: string, context?: any): SCError => 
  new SCError({
    code: 'CRYPTO_ERROR',
    message,
    category: ErrorCategory.CRYPTO,
    severity: ErrorSeverity.HIGH,
    timestamp: Date.now(),
    context,
    recoverable: false
  });

export const createStorageError = (message: string, context?: any): SCError => 
  new SCError({
    code: 'STORAGE_ERROR',
    message,
    category: ErrorCategory.STORAGE,
    severity: ErrorSeverity.MEDIUM,
    timestamp: Date.now(),
    context,
    recoverable: true
  });

export const createBLEError = (message: string, context?: any): SCError => 
  new SCError({
    code: 'BLE_ERROR',
    message,
    category: ErrorCategory.BLE,
    severity: ErrorSeverity.MEDIUM,
    timestamp: Date.now(),
    context,
    recoverable: true
  });
