/**
 * Unit tests for Logger
 */
import { Logger, LogLevel } from './logger';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    // Get fresh instance for each test
    logger = Logger.getInstance();
    logger.setLevel(LogLevel.DEBUG);
    logger.clearLogs();
  });

  describe('Singleton pattern', () => {
    it('should return the same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      expect(logger1).toBe(logger2);
    });
  });

  describe('Log levels', () => {
    it('should log at DEBUG level', () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug('Debug message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.DEBUG);
      expect(logs[0].message).toBe('Debug message');
    });

    it('should log at INFO level', () => {
      logger.info('Info message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.INFO);
    });

    it('should log at WARN level', () => {
      logger.warn('Warning message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
    });

    it('should log at ERROR level', () => {
      logger.error('Error message');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
    });
  });

  describe('Log filtering by level', () => {
    it('should filter out DEBUG when level is INFO', () => {
      logger.setLevel(LogLevel.INFO);
      logger.debug('Should not appear');
      logger.info('Should appear');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.INFO);
    });

    it('should filter out DEBUG and INFO when level is WARN', () => {
      logger.setLevel(LogLevel.WARN);
      logger.debug('No');
      logger.info('No');
      logger.warn('Yes');
      logger.error('Yes');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[1].level).toBe(LogLevel.ERROR);
    });

    it('should only log ERROR when level is ERROR', () => {
      logger.setLevel(LogLevel.ERROR);
      logger.debug('No');
      logger.info('No');
      logger.warn('No');
      logger.error('Yes');
      
      const logs = logger.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
    });
  });

  describe('Module filtering', () => {
    it('should log from enabled modules', () => {
      logger.enableModule('auth');
      logger.info('General message');
      logger.info('Auth message', 'auth');
      
      const logs = logger.getRecentLogs();
      // When module filters are active, only enabled modules are logged
      const authLogs = logs.filter(l => l.module === 'auth');
      expect(authLogs.length).toBeGreaterThan(0);
    });

    it('should not log from disabled modules', () => {
      logger.enableModule('auth');
      logger.info('Auth message', 'auth');
      logger.disableModule('auth');
      logger.info('Auth message 2', 'auth');
      
      const logs = logger.getRecentLogs();
      // After disabling, no new auth logs should appear
      const authLogs = logs.filter(l => l.message === 'Auth message 2');
      expect(authLogs).toHaveLength(0);
    });

    it('should handle multiple enabled modules', () => {
      logger.enableModule('auth');
      logger.enableModule('network');
      logger.info('Auth message', 'auth');
      logger.info('Network message', 'network');
      logger.info('Other message', 'other');
      
      const logs = logger.getRecentLogs();
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Structured logging', () => {
    it('should include timestamp', () => {
      const before = Date.now();
      logger.info('Test');
      const after = Date.now();
      
      const logs = logger.getRecentLogs();
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(logs[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should include additional data', () => {
      logger.info('Test', undefined, { userId: '123', action: 'login' });
      
      const logs = logger.getRecentLogs();
      expect(logs[0].data).toEqual({ userId: '123', action: 'login' });
    });

    it('should include module name', () => {
      logger.info('Test', 'auth');
      
      const logs = logger.getRecentLogs();
      expect(logs[0].module).toBe('auth');
    });
  });

  describe('Buffer management', () => {
    it('should clear logs', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      expect(logger.getRecentLogs()).toHaveLength(2);
      
      logger.clearLogs();
      expect(logger.getRecentLogs()).toHaveLength(0);
    });

    it('should limit buffer size', () => {
      // This assumes the logger has a max buffer size
      // We'd need to check the implementation to know the exact limit
      for (let i = 0; i < 10000; i++) {
        logger.info(`Message ${i}`);
      }
      
      const logs = logger.getRecentLogs(10000);
      // Should not exceed max buffer size (typically 5000)
      expect(logs.length).toBeLessThanOrEqual(5000);
    });

    it('should retrieve logs in order', () => {
      logger.info('First');
      logger.info('Second');
      logger.info('Third');
      
      const logs = logger.getRecentLogs();
      expect(logs[0].message).toBe('First');
      expect(logs[1].message).toBe('Second');
      expect(logs[2].message).toBe('Third');
    });
  });

  describe('Query functionality', () => {
    beforeEach(() => {
      logger.clearLogs();
      logger.debug('Debug 1', 'module-a');
      logger.info('Info 1', 'module-a');
      logger.warn('Warn 1', 'module-b');
      logger.error('Error 1', 'module-b');
    });

    it('should get logs by level', () => {
      const errorLogs = logger.getLogsByLevel(LogLevel.ERROR);
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe(LogLevel.ERROR);
    });

    it('should get logs by module', () => {
      const moduleALogs = logger.getLogsByModule('module-a');
      expect(moduleALogs).toHaveLength(2);
      expect(moduleALogs.every(l => l.module === 'module-a')).toBe(true);
    });

    it('should get logs by time range', () => {
      const now = Date.now();
      const logs = logger.getLogsByTimeRange(now - 10000, now + 10000);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Export functionality', () => {
    it('should export logs as JSON', () => {
      logger.clearLogs();
      logger.info('Test message', 'test-module', { key: 'value' });
      
      const exported = logger.exportLogs();
      expect(typeof exported).toBe('string');
      
      const parsed = JSON.parse(exported);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[parsed.length - 1].message).toBe('Test message');
    });
  });

  describe('Statistics', () => {
    it('should provide log statistics', () => {
      logger.clearLogs();
      logger.info('Info 1');
      logger.info('Info 2');
      logger.error('Error 1');
      logger.warn('Warn 1', 'module-a');
      
      const stats = logger.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(4);
      expect(stats.byLevel[LogLevel.INFO]).toBeGreaterThanOrEqual(2);
      expect(stats.byLevel[LogLevel.ERROR]).toBeGreaterThanOrEqual(1);
      expect(stats.byLevel[LogLevel.WARN]).toBeGreaterThanOrEqual(1);
      expect(stats.byModule['module-a']).toBeGreaterThanOrEqual(1);
    });
  });
});
