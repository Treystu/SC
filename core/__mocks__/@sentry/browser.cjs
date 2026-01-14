/**
 * Mock for @sentry/browser in Jest test environment
 * This prevents ESM/CJS compatibility issues in Node tests
 */

const init = () => {};
const captureException = () => {};
const captureMessage = () => {};
const setUser = () => {};
const setTag = () => {};
const setExtra = () => {};
const addBreadcrumb = () => {};
const configureScope = () => {};
const withScope = (callback) => callback({ setTag: () => {}, setExtra: () => {} });

module.exports = {
  init,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setExtra,
  addBreadcrumb,
  configureScope,
  withScope,
};
