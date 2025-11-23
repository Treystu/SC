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
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
      },
    }],
  },
  
  // Transform ES modules from node_modules
  transformIgnorePatterns: [],
};
