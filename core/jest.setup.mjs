// Jest setup file for ESM support
// This file ensures Jest globals are available in all test files when using experimental-vm-modules

import { jest } from '@jest/globals';

// Make jest available globally
globalThis.jest = jest;
