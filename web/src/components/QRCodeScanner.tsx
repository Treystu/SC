import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import {
  setJsQR,
  startCameraStream,
  scanQRFromVideo,
  isCameraAvailable,
} from "@sc/core";
import "./QRCodeScanner.css";

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

export const QRCodeScanner: React.FC<QRCodeScannerProps> = ({
  onScan,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize jsQR with the core library
    // We cast to any because the types might not match exactly or represent the function signature directly
    setJsQR(jsQR as any);

    let active = true;

    const start = async () => {
      try {
        if (!(await isCameraAvailable())) {
          throw new Error("Camera not found or permission denied");
        }

        const { video, stop } = await startCameraStream();
        stopRef.current = stop;

        if (videoRef.current && active) {
          // We assign the stream from the core-created video element to our React-ref video element
          videoRef.current.srcObject = video.srcObject;
          videoRef.current.play().catch((e) => console.error("Play error:", e));
          setLoading(false);

          // Start scanning
          abortControllerRef.current = new AbortController();

          // Run scanning loop
          while (active && !abortControllerRef.current.signal.aborted) {
            const result = await scanQRFromVideo(
              videoRef.current,
              abortControllerRef.current.signal,
            );
            if (result && active) {
              onScan(result);
              break; // Stop after first successful scan
            }
            // Small delay to prevent CPU spinning if scanQRFromVideo returns null immediately (though it waits for animation frame usually)
            await new Promise((r) => setTimeout(r, 100));
          }
        }
      } catch (err) {
        console.error("Scanner error:", err);
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to start camera",
          );
          setLoading(false);
        }
      }
    };

    start();

    return () => {
      active = false;
      if (stopRef.current) stopRef.current();
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [onScan]);

  return (
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-container">
        <button
          className="modal-close btn-icon"
          onClick={onClose}
          aria-label="Close scanner"
        >
          ×
        </button>
        <h3>Scan QR Code</h3>

        {error ? (
          <div className="error">
            <p>{error}</p>
            <button
              onClick={onClose}
              className="btn btn-secondary"
              style={{ marginTop: "10px" }}
            >
              Close
            </button>
          </div>
        ) : (
          <div className="video-wrapper">
            <video ref={videoRef} playsInline muted className="qr-video" />
            {!loading && <div className="scan-overlay"></div>}
            {loading && <div className="loading">Starting camera...</div>}
          </div>
        )}
      </div>
    </div>
  );
};
