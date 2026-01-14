/**
 * Custom Jest resolver for ESM packages
 * Handles @noble/* packages which are pure ESM
 */

const path = require('path');

module.exports = function (request, options) {
  // Handle @noble package imports with .js extension
  if (request.startsWith('@noble/') && request.endsWith('.js')) {
    // Try without .js extension first for Node resolution
    const withoutJs = request.slice(0, -3);
    try {
      return options.defaultResolver(withoutJs, options);
    } catch (e) {
      // Fall through to default
    }
  }

  // Handle relative imports with .js extension
  if ((request.startsWith('./') || request.startsWith('../')) && request.endsWith('.js')) {
    const withoutJs = request.slice(0, -3);
    try {
      return options.defaultResolver(withoutJs, options);
    } catch (e) {
      // Fall through to default
    }
  }

  return options.defaultResolver(request, options);
};
