// Jest setup file for ESM support
// This file ensures Jest globals are available in all test files when using experimental-vm-modules

import { jest } from '@jest/globals';

// Make jest available globally
globalThis.jest = jest;

jest.mock('./src/database', () => ({
    getDatabase: jest.fn(),
    Database: jest.fn()
}));
