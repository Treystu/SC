/**
 * Tests for error-handler.ts - Centralized error management system
 */

import {
  ErrorSeverity,
  ErrorCategory,
  ErrorContext,
  AppError,
  ErrorHandler,
  errorHandler
} from './error-handler';

describe('error-handler', () => {
  let handler: ErrorHandler;

  beforeEach(() => {
    handler = ErrorHandler.getInstance();
    handler.clearLog();
  });

  describe('ErrorSeverity', () => {
    it('should have all severity levels', () => {
      expect(ErrorSeverity.LOW).toBe('low');
      expect(ErrorSeverity.MEDIUM).toBe('medium');
      expect(ErrorSeverity.HIGH).toBe('high');
      expect(ErrorSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('ErrorCategory', () => {
    it('should have all error categories', () => {
      expect(ErrorCategory.NETWORK).toBe('network');
      expect(ErrorCategory.CRYPTO).toBe('crypto');
      expect(ErrorCategory.STORAGE).toBe('storage');
      expect(ErrorCategory.VALIDATION).toBe('validation');
      expect(ErrorCategory.PERMISSION).toBe('permission');
      expect(ErrorCategory.SYSTEM).toBe('system');
    });
  });

  describe('AppError', () => {
    it('should create error with required fields', () => {
      const error = new AppError({
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        message: 'Network connection failed'
      });

      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.message).toBe('Network connection failed');
      expect(error.timestamp).toBeDefined();
      expect(error.name).toBe('AppError');
    });

    it('should include optional fields', () => {
      const error = new AppError({
        category: ErrorCategory.CRYPTO,
        severity: ErrorSeverity.CRITICAL,
        message: 'Decryption failed',
        code: 'CRYPTO_001',
        details: { algorithm: 'AES-256' }
      });

      expect(error.code).toBe('CRYPTO_001');
      expect(error.details).toEqual({ algorithm: 'AES-256' });
    });

    it('should capture stack trace', () => {
      const error = new AppError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        message: 'Test error'
      });

      expect(error.stack).toBeDefined();
    });

    it('should extend Error class', () => {
      const error = new AppError({
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        message: 'Validation failed'
      });

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });
  });

  describe('ErrorHandler', () => {
    it('should be a singleton', () => {
      const instance1 = ErrorHandler.getInstance();
      const instance2 = ErrorHandler.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return global errorHandler instance', () => {
      expect(errorHandler).toBe(handler);
    });
  });

  describe('handle', () => {
    it('should handle AppError', () => {
      const error = new AppError({
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        message: 'Connection timeout'
      });

      handler.handle(error);

      const errors = handler.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Connection timeout');
      expect(errors[0].category).toBe(ErrorCategory.NETWORK);
    });

    it('should handle standard Error', () => {
      const error = new Error('Standard error');
      handler.handle(error);

      const errors = handler.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Standard error');
      expect(errors[0].category).toBe(ErrorCategory.SYSTEM);
      expect(errors[0].severity).toBe(ErrorSeverity.MEDIUM);
    });

    it('should merge additional context', () => {
      const error = new Error('Test error');
      handler.handle(error, {
        category: ErrorCategory.CRYPTO,
        severity: ErrorSeverity.CRITICAL,
        code: 'TEST_001',
        details: { key: 'value' },
        userId: 'user123',
        sessionId: 'session456'
      });

      const errors = handler.getRecentErrors();
      expect(errors[0].category).toBe(ErrorCategory.CRYPTO);
      expect(errors[0].severity).toBe(ErrorSeverity.CRITICAL);
      expect(errors[0].code).toBe('TEST_001');
      expect(errors[0].details).toEqual({ key: 'value' });
      expect(errors[0].userId).toBe('user123');
      expect(errors[0].sessionId).toBe('session456');
    });

    it('should notify error listeners', () => {
      const listener = jest.fn();
      handler.onError(listener);

      const error = new Error('Test error');
      handler.handle(error);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error',
          category: ErrorCategory.SYSTEM
        })
      );
    });

    it('should handle listener errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const badListener = jest.fn(() => {
        throw new Error('Listener failed');
      });
      
      handler.onError(badListener);
      handler.handle(new Error('Test'));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('onError', () => {
    it('should register error listener', () => {
      const listener = jest.fn();
      handler.onError(listener);

      handler.handle(new Error('Test'));

      expect(listener).toHaveBeenCalled();
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = handler.onError(listener);

      handler.handle(new Error('Test 1'));
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      handler.handle(new Error('Test 2'));
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      handler.onError(listener1);
      handler.onError(listener2);

      handler.handle(new Error('Test'));

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent errors', () => {
      handler.handle(new Error('Error 1'));
      handler.handle(new Error('Error 2'));
      handler.handle(new Error('Error 3'));

      const errors = handler.getRecentErrors();
      expect(errors).toHaveLength(3);
    });

    it('should limit number of errors returned', () => {
      for (let i = 0; i < 100; i++) {
        handler.handle(new Error(`Error ${i}`));
      }

      const errors = handler.getRecentErrors(10);
      expect(errors).toHaveLength(10);
      expect(errors[9].message).toBe('Error 99');
    });

    it('should default to 50 errors', () => {
      for (let i = 0; i < 100; i++) {
        handler.handle(new Error(`Error ${i}`));
      }

      const errors = handler.getRecentErrors();
      expect(errors).toHaveLength(50);
    });
  });

  describe('getErrorsByCategory', () => {
    beforeEach(() => {
      handler.handle(new Error('Network error'), { category: ErrorCategory.NETWORK });
      handler.handle(new Error('Crypto error'), { category: ErrorCategory.CRYPTO });
      handler.handle(new Error('Another network error'), { category: ErrorCategory.NETWORK });
      handler.handle(new Error('Storage error'), { category: ErrorCategory.STORAGE });
    });

    it('should filter errors by category', () => {
      const networkErrors = handler.getErrorsByCategory(ErrorCategory.NETWORK);
      expect(networkErrors).toHaveLength(2);
      expect(networkErrors.every(e => e.category === ErrorCategory.NETWORK)).toBe(true);
    });

    it('should return empty array for unused category', () => {
      const validationErrors = handler.getErrorsByCategory(ErrorCategory.VALIDATION);
      expect(validationErrors).toHaveLength(0);
    });
  });

  describe('getErrorsBySeverity', () => {
    beforeEach(() => {
      handler.handle(new Error('Critical error'), { severity: ErrorSeverity.CRITICAL });
      handler.handle(new Error('High error'), { severity: ErrorSeverity.HIGH });
      handler.handle(new Error('Another critical'), { severity: ErrorSeverity.CRITICAL });
      handler.handle(new Error('Low error'), { severity: ErrorSeverity.LOW });
    });

    it('should filter errors by severity', () => {
      const criticalErrors = handler.getErrorsBySeverity(ErrorSeverity.CRITICAL);
      expect(criticalErrors).toHaveLength(2);
      expect(criticalErrors.every(e => e.severity === ErrorSeverity.CRITICAL)).toBe(true);
    });

    it('should return empty array for unused severity', () => {
      handler.clearLog();
      const mediumErrors = handler.getErrorsBySeverity(ErrorSeverity.MEDIUM);
      expect(mediumErrors).toHaveLength(0);
    });
  });

  describe('clearLog', () => {
    it('should clear error log', () => {
      handler.handle(new Error('Error 1'));
      handler.handle(new Error('Error 2'));
      
      expect(handler.getRecentErrors()).toHaveLength(2);

      handler.clearLog();
      
      expect(handler.getRecentErrors()).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      handler.handle(new Error('Network 1'), { 
        category: ErrorCategory.NETWORK, 
        severity: ErrorSeverity.HIGH 
      });
      handler.handle(new Error('Network 2'), { 
        category: ErrorCategory.NETWORK, 
        severity: ErrorSeverity.MEDIUM 
      });
      handler.handle(new Error('Crypto 1'), { 
        category: ErrorCategory.CRYPTO, 
        severity: ErrorSeverity.CRITICAL 
      });
      handler.handle(new Error('Storage 1'), { 
        category: ErrorCategory.STORAGE, 
        severity: ErrorSeverity.LOW 
      });
    });

    it('should return total error count', () => {
      const stats = handler.getStats();
      expect(stats.total).toBe(4);
    });

    it('should count errors by category', () => {
      const stats = handler.getStats();
      expect(stats.byCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(stats.byCategory[ErrorCategory.CRYPTO]).toBe(1);
      expect(stats.byCategory[ErrorCategory.STORAGE]).toBe(1);
      expect(stats.byCategory[ErrorCategory.VALIDATION]).toBe(0);
    });

    it('should count errors by severity', () => {
      const stats = handler.getStats();
      expect(stats.bySeverity[ErrorSeverity.CRITICAL]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(1);
    });

    it('should initialize all categories and severities', () => {
      handler.clearLog();
      const stats = handler.getStats();

      Object.values(ErrorCategory).forEach(cat => {
        expect(stats.byCategory[cat as ErrorCategory]).toBe(0);
      });

      Object.values(ErrorSeverity).forEach(sev => {
        expect(stats.bySeverity[sev as ErrorSeverity]).toBe(0);
      });
    });
  });

  describe('Log size management', () => {
    it('should limit log size to maxLogSize', () => {
      // maxLogSize is 1000 by default
      for (let i = 0; i < 1500; i++) {
        handler.handle(new Error(`Error ${i}`));
      }

      const errors = handler.getRecentErrors(2000);
      expect(errors.length).toBeLessThanOrEqual(1000);
    });

    it('should keep most recent errors when trimming', () => {
      for (let i = 0; i < 1500; i++) {
        handler.handle(new Error(`Error ${i}`));
      }

      const errors = handler.getRecentErrors(2000);
      // Should have errors 500-1499 (most recent 1000)
      expect(errors[errors.length - 1].message).toContain('1499');
    });
  });

  describe('Recovery mechanisms', () => {
    it('should attempt network error recovery', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      handler.handle(new Error('Network error'), {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Queuing network operation for retry')
      );
      
      consoleSpy.mockRestore();
    });

    it('should not retry critical network errors', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      handler.handle(new Error('Critical network error'), {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.CRITICAL
      });

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Queuing network operation for retry')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle storage quota errors', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      handler.handle(new Error('Storage quota exceeded'), {
        category: ErrorCategory.STORAGE,
        code: 'QUOTA_EXCEEDED'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Storage quota exceeded')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle critical crypto errors', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      handler.handle(new Error('Key compromised'), {
        category: ErrorCategory.CRYPTO,
        severity: ErrorSeverity.CRITICAL
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical crypto error')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Logging methods', () => {
    it('should use console.error for critical severity', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      handler.handle(new Error('Critical error'), {
        severity: ErrorSeverity.CRITICAL
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should use console.error for high severity', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      handler.handle(new Error('High error'), {
        severity: ErrorSeverity.HIGH
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should use console.warn for medium severity', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      handler.handle(new Error('Medium error'), {
        severity: ErrorSeverity.MEDIUM
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should use console.log for low severity', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      handler.handle(new Error('Low error'), {
        severity: ErrorSeverity.LOW
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
