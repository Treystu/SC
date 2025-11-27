import { ErrorTracker } from './error-tracking.js';

/**
 * Error Handler - Centralized error management system
 * Task 181: Error handling and recovery utilities
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
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  SYSTEM = 'system'
}

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: number;
  stackTrace?: string;
  userId?: string;
  sessionId?: string;
}

export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code?: string;
  public readonly details?: Record<string, any>;
  public readonly timestamp: number;

  constructor(context: Omit<ErrorContext, 'timestamp' | 'stackTrace'>) {
    super(context.message);
    this.category = context.category;
    this.severity = context.severity;
    this.code = context.code;
    this.details = context.details;
    this.timestamp = Date.now();
    this.name = 'AppError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorLog: ErrorContext[] = [];
  private maxLogSize = 1000;
  private errorListeners: Array<(error: ErrorContext) => void> = [];

  private constructor() { }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle an error with automatic categorization and recovery
   */
  handle(error: Error | AppError, additionalContext?: Partial<ErrorContext>): void {
    const context = this.createErrorContext(error, additionalContext);

    // Log the error
    this.logError(context);

    // Notify listeners
    this.notifyListeners(context);

    // Attempt recovery based on severity and category
    this.attemptRecovery(context);

    // Report to monitoring service in production
    if (typeof window !== 'undefined' && (window as any).SC_PRODUCTION) {
      this.reportToMonitoring(context);
    }
  }

  /**
   * Create structured error context
   */
  private createErrorContext(
    error: Error | AppError,
    additional?: Partial<ErrorContext>
  ): ErrorContext {
    const isAppError = error instanceof AppError;

    return {
      category: isAppError ? error.category : (additional?.category || ErrorCategory.SYSTEM),
      severity: isAppError ? error.severity : (additional?.severity || ErrorSeverity.MEDIUM),
      message: error.message,
      code: isAppError ? error.code : additional?.code,
      details: isAppError ? error.details : additional?.details,
      timestamp: Date.now(),
      stackTrace: error.stack,
      userId: additional?.userId,
      sessionId: additional?.sessionId
    };
  }

  /**
   * Log error to internal buffer
   */
  private logError(context: ErrorContext): void {
    this.errorLog.push(context);

    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }

    // Console logging with severity-based formatting
    const logMethod = this.getLogMethod(context.severity);
    logMethod(
      `[${context.category.toUpperCase()}] ${context.message}`,
      context.details || ''
    );
  }

  /**
   * Get appropriate console method based on severity
   */
  private getLogMethod(severity: ErrorSeverity): (...args: any[]) => void {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return console.error.bind(console);
      case ErrorSeverity.MEDIUM:
        return console.warn.bind(console);
      default:
        return console.log.bind(console);
    }
  }

  /**
   * Attempt automatic recovery based on error type
   */
  private attemptRecovery(context: ErrorContext): void {
    switch (context.category) {
      case ErrorCategory.NETWORK:
        this.handleNetworkError(context);
        break;
      case ErrorCategory.STORAGE:
        this.handleStorageError(context);
        break;
      case ErrorCategory.CRYPTO:
        this.handleCryptoError(context);
        break;
      default:
        // No automatic recovery for other categories
        break;
    }
  }

  /**
   * Handle network-related errors
   */
  private handleNetworkError(context: ErrorContext): void {
    if (context.severity !== ErrorSeverity.CRITICAL) {
      // Queue for retry
      console.log('Queuing network operation for retry');
    }
  }

  /**
   * Handle storage-related errors
   */
  private handleStorageError(context: ErrorContext): void {
    if (context.code === 'QUOTA_EXCEEDED') {
      console.warn('Storage quota exceeded, attempting cleanup');
      // Trigger storage cleanup
    }
  }

  /**
   * Handle cryptographic errors
   */
  private handleCryptoError(context: ErrorContext): void {
    if (context.severity === ErrorSeverity.CRITICAL) {
      console.error('Critical crypto error - security compromised');
      // Notify user and potentially clear sensitive data
    }
  }

  /**
   * Report error to external monitoring service
   */
  private reportToMonitoring(context: ErrorContext): void {
    ErrorTracker.captureError(new AppError(context), {
      userId: context.userId,
      action: 'handle-error',
      metadata: context.details
    });
  }

  /**
   * Register error listener
   */
  onError(listener: (error: ErrorContext) => void): () => void {
    this.errorListeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all error listeners
   */
  private notifyListeners(context: ErrorContext): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(context);
      } catch (err) {
        console.error('Error in error listener:', err);
      }
    });
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 50): ErrorContext[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * Get errors by category
   */
  getErrorsByCategory(category: ErrorCategory): ErrorContext[] {
    return this.errorLog.filter(e => e.category === category);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): ErrorContext[] {
    return this.errorLog.filter(e => e.severity === severity);
  }

  /**
   * Clear error log
   */
  clearLog(): void {
    this.errorLog = [];
  }

  /**
   * Get error statistics
   */
  getStats(): {
    total: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
  } {
    const stats = {
      total: this.errorLog.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>
    };

    // Initialize counters
    Object.values(ErrorCategory).forEach(cat => {
      stats.byCategory[cat as ErrorCategory] = 0;
    });
    Object.values(ErrorSeverity).forEach(sev => {
      stats.bySeverity[sev as ErrorSeverity] = 0;
    });

    // Count occurrences
    this.errorLog.forEach(error => {
      stats.byCategory[error.category]++;
      stats.bySeverity[error.severity]++;
    });

    return stats;
  }
}

// Global error handler instance
export const errorHandler = ErrorHandler.getInstance();

// Global error handlers
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    errorHandler.handle(new Error(event.message), {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.HIGH,
      details: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    errorHandler.handle(new Error(String(event.reason)), {
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.MEDIUM
    });
  });
}
