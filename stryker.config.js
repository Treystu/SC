/**
 * Stryker Mutation Testing Configuration
 * @type {import('@stryker-mutator/core').PartialStrykerOptions}
 */
module.exports = {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress", "dashboard"],
  testRunner: "jest",
  coverageAnalysis: "perTest",
  
  // Project configuration
  mutate: [
    "core/src/**/*.ts",
    "!core/src/**/*.test.ts",
    "!core/src/**/*.spec.ts",
    "!core/src/**/*.d.ts",
    "!core/src/**/benchmarks.ts",
    "!core/src/index.ts"
  ],
  
  // Test configuration
  jest: {
    projectType: "custom",
    configFile: "core/jest.config.cjs",
    enableFindRelatedTests: true,
  },
  
  // TypeScript configuration
  checkers: ["typescript"],
  tsconfigFile: "core/tsconfig.json",
  
  // Mutation thresholds
  thresholds: {
    high: 80,
    low: 60,
    break: 50
  },
  
  // Timeout settings
  timeoutMS: 60000,
  timeoutFactor: 1.5,
  
  // Concurrency
  concurrency: 4,
  
  // Plugins
  plugins: [
    "@stryker-mutator/jest-runner",
    "@stryker-mutator/typescript-checker"
  ],
  
  // Ignore patterns
  ignorePatterns: [
    "node_modules",
    "dist",
    "coverage",
    "*.test.ts",
    "*.spec.ts",
    "benchmarks.ts"
  ],
  
  // Incremental mode
  incremental: true,
  incrementalFile: ".stryker-tmp/incremental.json",
  
  // Dashboard reporter
  dashboard: {
    project: "github.com/Treystu/SC",
    version: "main"
  }
};
