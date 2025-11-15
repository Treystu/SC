/**
 * Jest setup for integration tests
 */

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Mock environment-specific features
global.console = {
  ...console,
  // Suppress console logs in tests unless needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Keep warnings and errors
  warn: console.warn,
  error: console.error,
};

// Setup global test utilities
beforeAll(() => {
  // Global setup before all tests
});

afterAll(() => {
  // Global cleanup after all tests
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});
