module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
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
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
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
  // Configure transformers
  transform: {
    // Use ts-jest for TypeScript files
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        allowSyntheticDefaultImports: true,
      }
    }],
    // Use babel-jest for JS files including from node_modules
    '^.+\\.m?js$': 'babel-jest',
  },
  // Allow transformation of @noble packages
  transformIgnorePatterns: [
    'node_modules/(?!(@noble)/)',
  ],
  // Map .js extension imports to handle them correctly
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
