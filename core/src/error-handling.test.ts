/**
 * Unit tests for Error Handling
 */
import {
  ErrorSeverity,
  ErrorCategory,
  SCError,
  ErrorManager,
  ErrorDetails,
} from './error-handling';

describe('SCError', () => {
  it('should create an error with all properties', () => {
    const details: ErrorDetails = {
      code: 'NET_001',
      message: 'Network connection failed',
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      timestamp: Date.now(),
      context: { url: 'https://example.com' },
      recoverable: true,
    };

    const error = new SCError(details);

    expect(error.code).toBe('NET_001');
    expect(error.message).toBe('Network connection failed');
    expect(error.category).toBe(ErrorCategory.NETWORK);
    expect(error.severity).toBe(ErrorSeverity.HIGH);
    expect(error.recoverable).toBe(true);
    expect(error.context).toEqual({ url: 'https://example.com' });
  });

  it('should serialize to JSON', () => {
    const details: ErrorDetails = {
      code: 'CRYPTO_001',
      message: 'Encryption failed',
      category: ErrorCategory.CRYPTO,
      severity: ErrorSeverity.CRITICAL,
      timestamp: Date.now(),
      recoverable: false,
    };

    const error = new SCError(details);
    const json = error.toJSON();

    expect(json.code).toBe('CRYPTO_001');
    expect(json.message).toBe('Encryption failed');
    expect(json.category).toBe(ErrorCategory.CRYPTO);
    expect(json.severity).toBe(ErrorSeverity.CRITICAL);
    expect(json.recoverable).toBe(false);
  });

  it('should preserve stack trace', () => {
    const details: ErrorDetails = {
      code: 'TEST_001',
      message: 'Test error',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.LOW,
      timestamp: Date.now(),
      stack: 'Custom stack trace',
      recoverable: true,
    };

    const error = new SCError(details);
    expect(error.stack).toBe('Custom stack trace');
  });

  it('should be throwable', () => {
    const details: ErrorDetails = {
      code: 'TEST_002',
      message: 'Throwable error',
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now(),
      recoverable: true,
    };

    expect(() => {
      throw new SCError(details);
    }).toThrow('Throwable error');
  });
});

describe('ErrorManager', () => {
  let manager: ErrorManager;

  beforeEach(() => {
    manager = new ErrorManager();
  });

  describe('Handler registration', () => {
    it('should register category-specific handlers', async () => {
      const mockHandler = jest.fn();
      manager.registerHandler(ErrorCategory.NETWORK, mockHandler);

      const error = new SCError({
        code: 'NET_001',
        message: 'Network error',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
        recoverable: true,
      });

      await manager.handle(error);

      expect(mockHandler).toHaveBeenCalledWith(error);
    });

    it('should register global handlers', async () => {
      const mockHandler = jest.fn();
      manager.registerGlobalHandler(mockHandler);

      const error = new SCError({
        code: 'ANY_001',
        message: 'Any error',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        timestamp: Date.now(),
        recoverable: true,
      });

      await manager.handle(error);

      expect(mockHandler).toHaveBeenCalledWith(error);
    });

    it('should call multiple handlers for the same category', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      manager.registerHandler(ErrorCategory.CRYPTO, handler1);
      manager.registerHandler(ErrorCategory.CRYPTO, handler2);

      const error = new SCError({
        code: 'CRYPTO_001',
        message: 'Crypto error',
        category: ErrorCategory.CRYPTO,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        recoverable: false,
      });

      await manager.handle(error);

      expect(handler1).toHaveBeenCalledWith(error);
      expect(handler2).toHaveBeenCalledWith(error);
    });
  });

  describe('Error logging', () => {
    it('should log errors', async () => {
      const error = new SCError({
        code: 'LOG_001',
        message: 'Logged error',
        category: ErrorCategory.PROTOCOL,
        severity: ErrorSeverity.LOW,
        timestamp: Date.now(),
        recoverable: true,
      });

      await manager.handle(error);

      const logs = manager.getErrors();
      expect(logs).toContainEqual(error);
    });

    it('should limit log size', async () => {
      // Create more errors than max log size
      for (let i = 0; i < 1500; i++) {
        const error = new SCError({
          code: `ERR_${i}`,
          message: `Error ${i}`,
          category: ErrorCategory.UNKNOWN,
          severity: ErrorSeverity.LOW,
          timestamp: Date.now(),
          recoverable: true,
        });
        await manager.handle(error);
      }

      const logs = manager.getErrors();
      expect(logs.length).toBeLessThanOrEqual(1000);
    });

    it('should get errors by category', async () => {
      const networkError = new SCError({
        code: 'NET_001',
        message: 'Network error',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
        recoverable: true,
      });

      const cryptoError = new SCError({
        code: 'CRYPTO_001',
        message: 'Crypto error',
        category: ErrorCategory.CRYPTO,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        recoverable: false,
      });

      await manager.handle(networkError);
      await manager.handle(cryptoError);

      const networkErrors = manager.getErrors({ category: ErrorCategory.NETWORK });
      expect(networkErrors).toHaveLength(1);
      expect(networkErrors[0].code).toBe('NET_001');
    });

    it('should get errors by severity', async () => {
      const lowError = new SCError({
        code: 'LOW_001',
        message: 'Low severity',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        timestamp: Date.now(),
        recoverable: true,
      });

      const criticalError = new SCError({
        code: 'CRIT_001',
        message: 'Critical error',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        recoverable: false,
      });

      await manager.handle(lowError);
      await manager.handle(criticalError);

      const criticalErrors = manager.getErrors({ severity: ErrorSeverity.CRITICAL });
      expect(criticalErrors).toHaveLength(1);
      expect(criticalErrors[0].code).toBe('CRIT_001');
    });

    it('should clear error log', async () => {
      const error = new SCError({
        code: 'CLEAR_001',
        message: 'Will be cleared',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        timestamp: Date.now(),
        recoverable: true,
      });

      await manager.handle(error);
      expect(manager.getErrors().length).toBeGreaterThan(0);

      manager.clearErrors();
      expect(manager.getErrors()).toHaveLength(0);
    });
  });

  describe('Error statistics', () => {
    it('should provide error statistics', async () => {
      await manager.handle(new SCError({
        code: 'NET_001',
        message: 'Network 1',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
        recoverable: true,
      }));

      await manager.handle(new SCError({
        code: 'NET_002',
        message: 'Network 2',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.LOW,
        timestamp: Date.now(),
        recoverable: true,
      }));

      await manager.handle(new SCError({
        code: 'CRYPTO_001',
        message: 'Crypto',
        category: ErrorCategory.CRYPTO,
        severity: ErrorSeverity.CRITICAL,
        timestamp: Date.now(),
        recoverable: false,
      }));

      const stats = manager.getErrorStats();

      expect(stats.total).toBe(3);
      expect(stats.byCategory[ErrorCategory.NETWORK]).toBe(2);
      expect(stats.byCategory[ErrorCategory.CRYPTO]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.CRITICAL]).toBe(1);
    });
  });

  describe('Error handling', () => {
    it('should handle async handlers', async () => {
      const asyncHandler = jest.fn().mockResolvedValue(undefined);
      manager.registerHandler(ErrorCategory.NETWORK, asyncHandler);

      const error = new SCError({
        code: 'NET_001',
        message: 'Network error',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
        recoverable: true,
      });

      await manager.handle(error);

      expect(asyncHandler).toHaveBeenCalled();
    });

    it('should continue if a handler throws', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      const successHandler = jest.fn();

      manager.registerHandler(ErrorCategory.NETWORK, failingHandler);
      manager.registerHandler(ErrorCategory.NETWORK, successHandler);

      const error = new SCError({
        code: 'NET_001',
        message: 'Network error',
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.HIGH,
        timestamp: Date.now(),
        recoverable: true,
      });

      await manager.handle(error);

      expect(failingHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it('should convert regular errors to SCError', async () => {
      const regularError = new Error('Regular error');
      await manager.handle(regularError);

      const errors = manager.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      const convertedError = errors[errors.length - 1];
      expect(convertedError).toBeInstanceOf(SCError);
      expect(convertedError.message).toBe('Regular error');
      expect(convertedError.category).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe('Filter options', () => {
    it('should filter by time range', async () => {
      const oldTime = Date.now() - 10000;
      const newTime = Date.now();

      await manager.handle(new SCError({
        code: 'OLD_001',
        message: 'Old error',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        timestamp: oldTime,
        recoverable: true,
      }));

      await manager.handle(new SCError({
        code: 'NEW_001',
        message: 'New error',
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        timestamp: newTime,
        recoverable: true,
      }));

      const recentErrors = manager.getErrors({ since: newTime - 1000 });
      expect(recentErrors.length).toBeGreaterThanOrEqual(1);
      expect(recentErrors.every(e => e.timestamp >= newTime - 1000)).toBe(true);
    });

    it('should limit result count', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.handle(new SCError({
          code: `ERR_${i}`,
          message: `Error ${i}`,
          category: ErrorCategory.UNKNOWN,
          severity: ErrorSeverity.LOW,
          timestamp: Date.now(),
          recoverable: true,
        }));
      }

      const limitedErrors = manager.getErrors({ limit: 5 });
      expect(limitedErrors.length).toBe(5);
    });
  });
});
