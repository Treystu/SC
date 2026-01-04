// E2E test marker: write to localStorage as the very first line
try {
  if (typeof localStorage !== "undefined")
    localStorage.setItem("sc-e2e-marker", "main-started");
} catch (e) {
  /* ignore */
}
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeEncryption } from "./bootstrap";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./sentry"; // Sentry is initialized in sentry.ts
import "./index.css";

// Register service worker for PWA support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log(
          "Service Worker registered with scope:",
          registration.scope,
        );

        // Check for updates immediately
        registration.update();

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker == null) {
            return;
          }
          installingWorker.onstatechange = () => {
            if (installingWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New content is available; please refresh.
                console.log("New content is available; please refresh.");
                // Optional: Show a toast to the user to reload
              } else {
                // Content is cached for offline use.
                console.log("Content is cached for offline use.");
              }
            }
          };
        };
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  });
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  console.error("Failed to find the root element");
} else {
  (async () => {
    console.log("[Main] Starting app initialization...");
    try {
      // Ensure encryption is ready before mounting app to avoid decryption races
      console.log("[Main] Initializing encryption...");
      await initializeEncryption();
      console.log("[Main] Encryption initialized, mounting React app...");

      ReactDOM.createRoot(rootElement).render(
        // Temporarily disabled StrictMode to debug error #310
        <ErrorBoundary>
          <App />
        </ErrorBoundary>,
      );
      console.log("[Main] React app mounted successfully");
    } catch (error) {
      console.error("[Main] Error during app initialization:", error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errAny = error as any;
      // Show error in DOM for E2E/Playwright
      rootElement.innerHTML = `<div style="background:#b91c1c;color:white;padding:24px;font-weight:bold;font-size:1.2em;">FATAL INIT ERROR: ${errAny && (errAny.stack || errAny.message || errAny)}</div>`;
      // If running in E2E (Playwright), write error to a log file for extraction
      try {
        if (navigator.webdriver) {
          // Write error to localStorage for Playwright to read
          try {
            localStorage.setItem(
              "sc-e2e-fatal-error",
              String(errAny && (errAny.stack || errAny.message || errAny)),
            );
          } catch (e) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    }
  })();
}
