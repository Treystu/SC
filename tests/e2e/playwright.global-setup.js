// Playwright global setup to capture E2E error logs
const fs = require("fs");
const path = require("path");
const { createServer } = require("http");

const LOG_PATH = "/tmp/sc-e2e-error.log";

module.exports = async function globalSetup() {
  // Start a simple HTTP server to capture error logs
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/__e2e_error_log__") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        fs.writeFileSync(LOG_PATH, body);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  try {
    server.listen(43210, () => {
      console.log("E2E Error Log Server listening on port 43210");
    });
    server.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        console.log(
          "E2E Error Log Server port 43210 already in use, skipping start.",
        );
        // We can't easily access the existing server, so we'll just assume it works or ignore logging for this run if strictly required.
        // However, for Playwright strict mode, maybe we should carry on.
        // Or we can try to reuse it if we could, but here we just suppress the crash.
      } else {
        console.error("E2E Error Log Server error:", e);
      }
    });
  } catch (e) {
    if (e.code !== "EADDRINUSE") {
      throw e;
    }
  }

  process.env.SC_E2E_ERROR_LOG_SERVER = "http://localhost:43210";
  global.__SC_E2E_ERROR_LOG_SERVER = server;
};

module.exports.LOG_PATH = LOG_PATH;
