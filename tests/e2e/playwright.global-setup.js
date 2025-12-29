// Playwright global setup to capture E2E error logs
const fs = require('fs');
const path = require('path');
const { createServer } = require('http');

const LOG_PATH = '/tmp/sc-e2e-error.log';

module.exports = async function globalSetup() {
  // Start a simple HTTP server to capture error logs
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__e2e_error_log__') {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        fs.writeFileSync(LOG_PATH, body);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(43210);
  process.env.SC_E2E_ERROR_LOG_SERVER = 'http://localhost:43210';
  global.__SC_E2E_ERROR_LOG_SERVER = server;
};

module.exports.LOG_PATH = LOG_PATH;
