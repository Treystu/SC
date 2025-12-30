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
      '/core/src/.*\\.(e2e|integration|playwright|visual)\\.test\\.(ts|js|mjs)$',
      '/tests/.*vitest.*',
      '/tests/.*@playwright/test.*',
      '/tests/scripts/',
    ],
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.test.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: '<rootDir>/tsconfig.test.json',
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    // NOTE: Removed jest mocks for @noble libraries because they use fake crypto implementations
    // Tests that need real crypto (like test-vectors.test.ts) should use actual @noble libraries
    // Only keep mocks for specific utilities if needed by non-crypto tests
  },
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  preset: 'ts-jest/presets/default-esm',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true }],
    '^.+\\.(js|mjs)$': [
      'babel-jest',
      { configFile: './babel.config.cjs' }
    ]
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@noble|@sc|fflate)/)',
    '/dist/'
  ],
  injectGlobals: true,
};
