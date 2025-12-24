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
    // Ensure encryption is ready before mounting app to avoid decryption races
    await initializeEncryption();

    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  })();
}
