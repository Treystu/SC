import React, { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const PWAInstall: React.FC = () => {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for successful install
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setInstallPrompt(null);
    });

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  if (isInstalled || !showPrompt) return null;

  const isAndroid = /Android/i.test(navigator.userAgent);
  
  // Get latest APK download URL from GitHub releases
  const apkDownloadUrl = "https://github.com/Treystu/SC/releases/latest/download/app-release.apk";

  return (
    <div
      className="pwa-install-prompt"
      role="dialog"
      aria-labelledby="install-title"
    >
      <div className="prompt-content">
        <h3 id="install-title">Install Sovereign Communications</h3>
        <p>Install our app for a better experience:</p>
        <ul>
          <li>Works offline</li>
          <li>Faster performance</li>
          <li>Desktop icon</li>
          <li>Full-screen mode</li>
          {isAndroid && (
            <li>
              <strong>Full Mesh Networking (Android Native App)</strong>
            </li>
          )}
        </ul>
        <div className="prompt-actions">
          <button onClick={handleInstallClick} className="btn-primary">
            Install Web App
          </button>
          {isAndroid && (
            <a
              href={apkDownloadUrl}
              download="sovereign-communications.apk"
              className="btn-primary"
              style={{ marginLeft: "10px", textDecoration: "none", display: "inline-block" }}
            >
              📲 Download Android APK
            </a>
          )}
          <button onClick={handleDismiss} className="btn-secondary">
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};

// Service worker registration and update handling
export const useServiceWorker = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          setRegistration(reg);

          // Check for updates
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  setUpdateAvailable(true);
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    }
  }, []);

  const applyUpdate = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      window.location.reload();
    }
  };

  return { updateAvailable, applyUpdate };
};

export const UpdateNotification: React.FC = () => {
  const { updateAvailable, applyUpdate } = useServiceWorker();

  if (!updateAvailable) return null;

  return (
    <div className="update-notification" role="alert">
      <p>A new version is available!</p>
      <button onClick={applyUpdate}>Update Now</button>
    </div>
  );
};
