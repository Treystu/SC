module.exports = {
  displayName: 'Integration Tests',
  preset: 'ts-jest',
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
  
  // Module resolution
  moduleNameMapper: {
    '^@sc/core$': '<rootDir>/core/src',
    '^@sc/core/(.*)$': '<rootDir>/core/src/$1',
  },
  
  // Transform
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
};
