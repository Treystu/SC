/**
 * Jest configuration for CommonJS
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.mjs',
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).mjs',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/benchmarks.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 30,
      lines: 30,
      statements: 30
    }
  },
  testTimeout: 10000,
  maxWorkers: '50%',
  bail: false,
  verbose: true,
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
    '^@sentry/browser$': '<rootDir>/__mocks__/@sentry/browser.cjs',
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  resolver: '<rootDir>/jest-esm-resolver.cjs',
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json'
    }],
    '^.+\\.(js|mjs)$': [
      'babel-jest',
      { configFile: './babel.config.cjs' }
    ]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@sc|fflate|@noble/ciphers|@noble/curves|@noble/hashes)/)',
    '/dist/'
  ],
  injectGlobals: true,
};
