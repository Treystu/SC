module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.integration.test.ts', '**/*.integration.spec.ts'],
  
  // Setup and teardown
  globalSetup: '<rootDir>/tests/integration/setup.ts',
  globalTeardown: '<rootDir>/tests/integration/teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/tests/integration/jest.setup.ts'],
  
  // Coverage
  collectCoverageFrom: [
    'core/src/**/*.ts',
    'web/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Timeouts for integration tests
  testTimeout: 30000,
  
  // ESM support
  extensionsToTreatAsEsm: ['.ts'],
  
  // Module resolution
  moduleNameMapper: {
    '^@sc/core$': '<rootDir>/core/src',
    '^@sc/core/(.*)$': '<rootDir>/core/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Transform
  transform: {
    '^.+\\.(ts|tsx)$': [
      'babel-jest',
      { configFile: './babel.config.js' }
    ],
    '^.+\\.[cm]?js$': ['babel-jest', { configFile: './babel.config.js' }],
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(nanoid|@noble|fast-check|@sc)/)',
    '/dist/'
  ],

  // Ignore all E2E, Playwright, Vitest, and non-Jest test files
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/',
    '/tests/playwright/',
    '/tests/visual/',
    '/tests/.*\\.(e2e|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/web/src/.*__tests__/.*\\.(e2e|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/core/src/.*\\.(e2e|integration|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/tests/.*vitest.*',
    '/tests/.*@playwright/test.*',
    '/tests/.*test\\s*\\(',
    '/tests/.*describe\\s*\\(',
    '/tests/.*expect\\s*\\(',
    '/web/src/.*__tests__/.*vitest.*',
    '/web/src/.*__tests__/.*@playwright/test.*',
    '/core/src/.*vitest.*',
    '/core/src/.*@playwright/test.*',
  ],
};
