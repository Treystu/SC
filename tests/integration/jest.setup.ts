/**
 * Jest setup for integration tests
 */

// Mock environment-specific features
global.console = {
  ...console,
  // Suppress console logs in tests unless needed
  log: () => {},
  debug: () => {},
  info: () => {},
  // Keep warnings and errors
  warn: console.warn,
  error: console.error,
};
