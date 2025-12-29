/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/e2e/',
    '/tests/.*\\.(e2e|integration|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/web/src/.*__tests__/.*\\.(e2e|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/core/src/.*\\.(e2e|integration|playwright|visual)\\.test\\.(ts|js|mjs)$',
    '/tests/.*vitest.*',
    '/tests/.*@playwright/test.*',
    '/tests/scripts/',
  ],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@sc/core$': '<rootDir>/../core/src/index.ts',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'commonjs',
      },
    }],
  },
};
