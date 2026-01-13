/**
 * Jest configuration for TypeScript
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/benchmarks.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20
    }
  },
  testTimeout: 10000,
  maxWorkers: 1,
  bail: false,
  verbose: false,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  forceExit: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tests/.*\\.(e2e|integration|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/web/src/.*__tests__/.*\\.(e2e|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/core/src/.*\\.(e2e|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/tests/.*vitest.*',
    '/tests/.*@playwright/test.*',
    '/tests/scripts/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { 
      tsconfig: '<rootDir>/tsconfig.test.json'
    }]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@noble|@sc|fflate)/)',
    '/dist/'
  ]
};
