module.exports = {
  testEnvironment: 'jsdom',
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
    '^@noble/hashes/utils$': '<rootDir>/jest-mocks/@noble-hashes-utils.cjs',
    '^@noble/hashes/sha2.js$': '<rootDir>/jest-mocks/@noble-hashes-sha2.cjs',
    '^@noble/hashes/sha2$': '<rootDir>/jest-mocks/@noble-hashes-sha2.cjs',
    '^@noble/hashes/hkdf.js$': '<rootDir>/jest-mocks/@noble-hashes-hkdf.cjs',
    '^@noble/hashes/hkdf$': '<rootDir>/jest-mocks/@noble-hashes-hkdf.cjs',
    '^@noble/hashes/utils.js$': '<rootDir>/jest-mocks/@noble-hashes-utils.cjs',
    '^@noble/curves/ed25519.js$': '<rootDir>/jest-mocks/@noble-curves-ed25519.cjs',
    '^@noble/curves/ed25519$': '<rootDir>/jest-mocks/@noble-curves-ed25519.cjs',
    '^@noble/ciphers/chacha.js$': '<rootDir>/jest-mocks/@noble-ciphers-chacha.cjs',
    '^@noble/ciphers/chacha$': '<rootDir>/jest-mocks/@noble-ciphers-chacha.cjs',
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
