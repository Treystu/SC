/**
 * Jest configuration for TypeScript
 */

const config = {
  // Test environment
  testEnvironment: 'jsdom',
  
  // Roots
  roots: ['<rootDir>/src'],
  
  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)'
  ],
  
  // Coverage configuration
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { 
      tsconfig: '<rootDir>/tsconfig.test.json',
      useESM: false,
    }]
  },
  
  // Module name mapper
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
    '^(\\.{1,2}/.*)\\.ts$': '$1',
  },
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  
  // Module path ignore patterns
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  
  // Transform ignore patterns
  transformIgnorePatterns: [
    '/node_modules/(?!(?:@noble|@sc|fflate)/)',
    '/dist/'
  ],
  
  // Test path ignore patterns
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
  
  // Verbose output
  verbose: true,
  
  // Clear mocks
  clearMocks: true,
  
  // Restore mocks
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Max workers
  maxWorkers: '50%',
  
  // Cache
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Test timeout
  testTimeout: 10000,
  
  // Haste configuration
  haste: {
    enableSymlinks: false,
  },
  
  // Resolver
  resolver: undefined,
  
  // Global configuration
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
      useESM: false,
    },
  },
};

module.exports = config;
