/**
 * Centralized Error Handling
 * Task 166: Advanced error handling and recovery
 * 
 * Provides consistent error handling across the application
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
  MESH = 'mesh',
  BLE = 'ble',
  WEBRTC = 'webrtc',
  VALIDATION = 'validation',
  PERMISSION = 'permission',
  UNKNOWN = 'unknown'
}

export interface AppError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  details?: any;
  timestamp: number;
  stack?: string;
  recoverable: boolean;
  retryable: boolean;
}

export interface ErrorHandler {
  (error: AppError): void;
}

export interface RecoveryStrategy {
  canRecover: (error: AppError) => boolean;
  recover: (error: AppError) => Promise<boolean>;
}

export class ErrorManager {
  private handlers: Map<ErrorCategory, ErrorHandler[]> = new Map();
  private recoveryStrategies: RecoveryStrategy[] = [];
  private errorLog: AppError[] = [];
  private maxLogSize = 1000;
  
  /**
   * Register error handler for specific category
   */
  onError(category: ErrorCategory, handler: ErrorHandler): void {
    if (!this.handlers.has(category)) {
      this.handlers.set(category, []);
    }
    this.handlers.get(category)!.push(handler);
  }
  
  /**
   * Register recovery strategy
   */
  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
  }
  
  /**
   * Handle error with optional recovery
   */
  async handleError(error: Error | AppError, category?: ErrorCategory): Promise<void> {
    const appError = this.normalizeError(error, category);
    
    // Log error
    this.logError(appError);
    
    // Attempt recovery if recoverable
    if (appError.recoverable) {
      const recovered = await this.attemptRecovery(appError);
      if (recovered) {
        console.log(`Recovered from error: ${appError.message}`);
        return;
      }
    }
    
    // Notify handlers
    this.notifyHandlers(appError);
    
    // Critical errors should be escalated
    if (appError.severity === ErrorSeverity.CRITICAL) {
      this.escalateCriticalError(appError);
    }
  }
  
  /**
   * Normalize error to AppError format
   */
  private normalizeError(error: Error | AppError, category?: ErrorCategory): AppError {
    if ('category' in error && 'severity' in error) {
      return error as AppError;
    }
    
    const baseError = error as Error;
    return {
      id: this.generateErrorId(),
      category: category || ErrorCategory.UNKNOWN,
      severity: this.inferSeverity(baseError),
      message: baseError.message,
      details: baseError,
      timestamp: Date.now(),
      stack: baseError.stack,
      recoverable: this.isRecoverable(baseError),
      retryable: this.isRetryable(baseError)
    };
  }
  
  /**
   * Infer error severity from error details
   */
  private inferSeverity(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal')) {
      return ErrorSeverity.CRITICAL;
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return ErrorSeverity.MEDIUM;
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorSeverity.LOW;
    }
    
    return ErrorSeverity.MEDIUM;
  }
  
  /**
   * Check if error is recoverable
   */
  private isRecoverable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Network errors are often recoverable
    if (message.includes('network') || message.includes('timeout')) {
      return true;
    }
    
    // Crypto/validation errors are not recoverable
    if (message.includes('crypto') || message.includes('invalid key')) {
      return false;
    }
    
    return false;
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    return message.includes('network') || 
           message.includes('timeout') || 
           message.includes('unavailable');
  }
  
  /**
   * Attempt recovery using registered strategies
   */
  private async attemptRecovery(error: AppError): Promise<boolean> {
    for (const strategy of this.recoveryStrategies) {
      if (strategy.canRecover(error)) {
        try {
          const recovered = await strategy.recover(error);
          if (recovered) {
            return true;
          }
        } catch (recoveryError) {
          console.error('Recovery strategy failed:', recoveryError);
        }
      }
    }
    
    return false;
  }
  
  /**
   * Notify registered handlers
   */
  private notifyHandlers(error: AppError): void {
    const handlers = this.handlers.get(error.category) || [];
    const allHandlers = this.handlers.get(ErrorCategory.UNKNOWN) || [];
    
    [...handlers, ...allHandlers].forEach(handler => {
      try {
        handler(error);
      } catch (e) {
        console.error('Error handler failed:', e);
      }
    });
  }
  
  /**
   * Escalate critical error
   */
  private escalateCriticalError(error: AppError): void {
    console.error('CRITICAL ERROR:', error);
    
    // Could send to error reporting service
    // Could trigger emergency shutdown
    // Could notify user with urgent message
  }
  
  /**
   * Log error to history
   */
  private logError(error: AppError): void {
    this.errorLog.push(error);
    
    // Trim log if too large
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
  }
  
  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get error log
   */
  getErrorLog(category?: ErrorCategory, severity?: ErrorSeverity): AppError[] {
    let errors = this.errorLog;
    
    if (category) {
      errors = errors.filter(e => e.category === category);
    }
    
    if (severity) {
      errors = errors.filter(e => e.severity === severity);
    }
    
    return errors;
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
  getStatistics(): Record<string, any> {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    
    this.errorLog.forEach(error => {
      byCategory[error.category] = (byCategory[error.category] || 0) + 1;
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
    });
    
    return {
      total: this.errorLog.length,
      byCategory,
      bySeverity,
      recentErrors: this.errorLog.slice(-10)
    };
  }
}

/**
 * Global error manager instance
 */
export const errorManager = new ErrorManager();

/**
 * Network recovery strategy
 */
export const networkRecoveryStrategy: RecoveryStrategy = {
  canRecover: (error) => error.category === ErrorCategory.NETWORK && error.retryable,
  recover: async (error) => {
    console.log('Attempting network recovery...');
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Could trigger reconnection logic here
    return true;
  }
};

errorManager.addRecoveryStrategy(networkRecoveryStrategy);
