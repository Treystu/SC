/**
 * Stryker configuration for mutation testing
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
module.exports = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'dashboard'],
  testRunner: 'jest',
  
  // Coverage analysis
  coverageAnalysis: 'perTest',
  
  // Files to mutate
  mutate: [
    'core/src/**/*.ts',
    '!core/src/**/*.test.ts',
    '!core/src/**/*.spec.ts',
    '!core/src/index.ts',
    '!core/src/**/*.d.ts',
  ],
  
  // Thresholds
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  
  // Jest configuration
  jest: {
    projectType: 'custom',
    configFile: 'core/jest.config.cjs',
    enableFindRelatedTests: true,
  },
  
  // TypeScript checker
  checkers: ['typescript'],
  tsconfigFile: 'core/tsconfig.json',
  
  // Concurrency
  concurrency: 4,
  
  // Timeouts
  timeoutMS: 60000,
  timeoutFactor: 1.5,
  
  // Ignore patterns
  ignorePatterns: [
    'node_modules',
    'dist',
    'coverage',
    '*.config.js',
    '*.config.ts',
  ],
  
  // Mutations to test
  mutator: {
    plugins: ['typescript'],
    excludedMutations: [
      'StringLiteral', // Don't mutate string literals (often errors/logs)
      'ObjectLiteral', // Don't mutate object literals
    ],
  },
  
  // HTML reporter options
  htmlReporter: {
    baseDir: 'reports/mutation',
  },
};
