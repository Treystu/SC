// Playwright global teardown to close the error log server
module.exports = async function globalTeardown() {
  if (global.__SC_E2E_ERROR_LOG_SERVER) {
    global.__SC_E2E_ERROR_LOG_SERVER.close();
  }
};
