import { logger, LogEntry, LogLevel } from "@sc/core";
import { useState, useEffect } from "react";
import { useMeshNetwork } from "../hooks/useMeshNetwork";

interface NetworkStats {
  connectedPeers: number;
  meshNeighbors: number;     // SILENT MESH: Raw mesh connections
  ledgerNodes: number;       // SILENT MESH: Known nodes in Eternal Ledger
  messagesSent: number;
  messagesReceived: number;
  bandwidth: {
    upload: number;
    download: number;
  };
  latency: {
    average: number;
    min: number;
    max: number;
  };
  packetLoss: number;
  uptime: number;
  bleConnections: number;
  webrtcConnections: number;
  error?: string;
}

export const NetworkDiagnostics: React.FC = () => {
  const { getStats, getSilentMeshStats, status } = useMeshNetwork();
  const [stats, setStats] = useState<NetworkStats>({
    // ... existing stats state
    connectedPeers: 0,
    meshNeighbors: 0,
    ledgerNodes: 0,
    messagesSent: 0,
    messagesReceived: 0,
    bandwidth: { upload: 0, download: 0 },
    latency: { average: 0, min: 0, max: 0 },
    packetLoss: 0,
    uptime: 0,
    bleConnections: 0,
    webrtcConnections: 0,
    error: undefined,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);

  // ... (existing state)
  const [refreshInterval, setRefreshInterval] = useState(1000);
  const [lastUpload, setLastUpload] = useState(0);
  const [lastDownload, setLastDownload] = useState(0);
  const [lastTimestamp, setLastTimestamp] = useState(0);
  const [startTime] = useState(Date.now());

  // Log subscription
  useEffect(() => {
    // Initial Load
    setLogs(logger.getLogs().reverse());

    // Subscribe
    const handleLog = (entry: LogEntry) => {
      setLogs((prev) => [entry, ...prev].slice(0, 200));
    };

    logger.onLog(handleLog);

    // Cleanup not strictly necessary as logger listeners persist,
    // but typically we'd want to unsubscribe.
    // However, Logger class doesn't seem to have offLog.
    // Given the component lifecycle, it's okay for now, or we can add it later to core.
    return () => {};
  }, []);

  useEffect(() => {
    // ... (existing stats interval)
    const interval = setInterval(async () => {
      const newStats = await getStats();
      if (newStats) {
        // ... (existing stats logic)
        let totalBytesSent = 0;
        let totalBytesReceived = 0;
        let totalPacketsLost = 0;
        let totalRoundTripTime = 0;
        let roundTripTimeSamples = 0;
        let minLatency = Infinity;
        let maxLatency = 0;
        let webrtcConnections = 0;

        newStats.peers.peers?.forEach((peer) => {
          if (peer.state === "connected") {
            webrtcConnections++;
            if (peer.stats) {
              peer.stats.forEach((report) => {
                if (report.type === "transport") {
                  totalBytesSent += report.bytesSent || 0;
                  totalBytesReceived += report.bytesReceived || 0;
                }
                if (report.type === "remote-inbound-rtp") {
                  totalPacketsLost += report.packetsLost || 0;
                  totalRoundTripTime += report.roundTripTime || 0;
                  if (report.roundTripTime) {
                    roundTripTimeSamples++;
                    minLatency = Math.min(
                      minLatency,
                      report.roundTripTime * 1000,
                    );
                    maxLatency = Math.max(
                      maxLatency,
                      report.roundTripTime * 1000,
                    );
                  }
                }
              });
            }
          }
        });

        const now = Date.now();
        const deltaTime = (now - lastTimestamp) / 1000; // in seconds
        const uptime = now - startTime;

        const uploadBw =
          deltaTime > 0 ? (totalBytesSent - lastUpload) / deltaTime : 0;
        const downloadBw =
          deltaTime > 0 ? (totalBytesReceived - lastDownload) / deltaTime : 0;

        // SILENT MESH: Get mesh stats for display
        const silentMeshStats = await getSilentMeshStats();

        setStats({
          // SILENT MESH: Use status.meshNeighborCount for raw mesh connections
          connectedPeers: status.meshNeighborCount || newStats.peers.connectedPeers,
          meshNeighbors: silentMeshStats?.meshNeighbors || status.meshNeighborCount || 0,
          ledgerNodes: silentMeshStats?.ledgerNodes || status.ledgerNodeCount || 0,
          messagesSent: newStats.relay.messagesForwarded,
          messagesReceived: newStats.relay.messagesReceived,
          bandwidth: {
            upload: uploadBw,
            download: downloadBw,
          },
          latency: {
            average:
              roundTripTimeSamples > 0
                ? (totalRoundTripTime / roundTripTimeSamples) * 1000
                : 0,
            min: minLatency === Infinity ? 0 : minLatency,
            max: maxLatency,
          },
          packetLoss: totalPacketsLost,
          uptime: uptime,
          bleConnections: 0, // Assuming no BLE connections for now
          webrtcConnections: webrtcConnections,
          error: status.joinError || undefined,
        });

        setLastUpload(totalBytesSent);
        setLastDownload(totalBytesReceived);
        setLastTimestamp(now);
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [
    refreshInterval,
    getStats,
    getSilentMeshStats,
    lastTimestamp,
    lastUpload,
    lastDownload,
    startTime,
    status.joinError,
    status.meshNeighborCount,
    status.ledgerNodeCount,
  ]); // Added Silent Mesh stats to deps

  // ... (existing helper functions)
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getHealthColor = (
    value: number,
    thresholds: { good: number; warn: number },
  ): string => {
    if (value <= thresholds.good) return "#4CAF50";
    if (value <= thresholds.warn) return "#FF9800";
    return "#f44336";
  };

  return (
    <div
      style={{
        padding: "20px",
        backgroundColor: "#1a1a1a",
        color: "#fff",
        minHeight: "100vh",
      }}
    >
      {/* ... existing header ... */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}
      >
        <h1>Network Diagnostics</h1>
        <div>
          <label style={{ marginRight: "10px" }}>Refresh:</label>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            style={{
              padding: "5px",
              backgroundColor: "#333",
              color: "#fff",
              border: "none",
            }}
          >
            <option value={500}>0.5s</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {stats.error && (
        <div
          style={{
            backgroundColor: "#f44336",
            color: "white",
            padding: "10px",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          <strong>Error:</strong> {stats.error}
        </div>
      )}

      {/* Overview Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "15px",
          marginBottom: "30px",
        }}
      >
        {/* SILENT MESH: Mesh Neighbors Card (raw connections) */}
        <div
          style={{
            backgroundColor: "#2a2a2a",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}>
            Mesh Neighbors
          </div>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: stats.meshNeighbors > 0 ? "#4CAF50" : "#888" }}>
            {stats.meshNeighbors}
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
            BLE: {stats.bleConnections} | WebRTC: {stats.webrtcConnections}
          </div>
        </div>

        {/* SILENT MESH: Eternal Ledger Card */}
        <div
          style={{
            backgroundColor: "#2a2a2a",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}>
            Known Nodes (Ledger)
          </div>
          <div style={{ fontSize: "32px", fontWeight: "bold", color: "#9C27B0" }}>
            {stats.ledgerNodes}
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
            Persistent across identity resets
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#2a2a2a",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}>
            Messages
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold" }}>
            ↑ {stats.messagesSent} / ↓ {stats.messagesReceived}
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
            Total: {stats.messagesSent + stats.messagesReceived}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#2a2a2a",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}>
            Latency
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: getHealthColor(stats.latency.average, {
                good: 50,
                warn: 100,
              }),
            }}
          >
            {stats.latency.average.toFixed(0)}ms
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
            Min: {stats.latency.min.toFixed(0)}ms | Max:{" "}
            {stats.latency.max.toFixed(0)}ms
          </div>
        </div>

        <div
          style={{
            backgroundColor: "#2a2a2a",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <div style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}>
            Packet Loss
          </div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
              color: getHealthColor(stats.packetLoss, { good: 1, warn: 3 }),
            }}
          >
            {stats.packetLoss.toFixed(2)}%
          </div>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "5px" }}>
            Uptime: {formatUptime(stats.uptime)}
          </div>
        </div>
      </div>

      {/* Bandwidth */}
      <div
        style={{
          backgroundColor: "#2a2a2a",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "15px" }}>Bandwidth</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
          }}
        >
          <div>
            <div
              style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}
            >
              Upload
            </div>
            <div
              style={{ fontSize: "24px", fontWeight: "bold", color: "#4CAF50" }}
            >
              {formatBytes(stats.bandwidth.upload)}/s
            </div>
            <div
              style={{
                marginTop: "10px",
                height: "10px",
                backgroundColor: "#333",
                borderRadius: "5px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min((stats.bandwidth.upload / (1024 * 1024)) * 100, 100)}%`,
                  height: "100%",
                  backgroundColor: "#4CAF50",
                }}
              />
            </div>
          </div>
          <div>
            <div
              style={{ fontSize: "14px", color: "#888", marginBottom: "5px" }}
            >
              Download
            </div>
            <div
              style={{ fontSize: "24px", fontWeight: "bold", color: "#2196F3" }}
            >
              {formatBytes(stats.bandwidth.download)}/s
            </div>
            <div
              style={{
                marginTop: "10px",
                height: "10px",
                backgroundColor: "#333",
                borderRadius: "5px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min((stats.bandwidth.download / (1024 * 1024)) * 100, 100)}%`,
                  height: "100%",
                  backgroundColor: "#2196F3",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Connection Types */}
      <div
        style={{
          backgroundColor: "#2a2a2a",
          padding: "20px",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "15px" }}>
          Connection Distribution
        </h2>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <div
            style={{
              flex: stats.bleConnections,
              backgroundColor: "#9C27B0",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
            }}
          >
            BLE: {stats.bleConnections}
          </div>
          <div
            style={{
              flex: stats.webrtcConnections,
              backgroundColor: "#FF5722",
              height: "30px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
            }}
          >
            WebRTC: {stats.webrtcConnections}
          </div>
        </div>
      </div>

      {/* Live Logs */}
      <div
        style={{
          backgroundColor: "#2a2a2a",
          padding: "20px",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <h2 style={{ margin: 0 }}>System Logs</h2>
          <span style={{ fontSize: "12px", color: "#888" }}>
            {logs.length} entries
          </span>
        </div>
        <div
          style={{
            height: "400px",
            overflowY: "auto",
            backgroundColor: "#111",
            borderRadius: "4px",
            padding: "10px",
            fontFamily: 'Consolas, Monaco, "Andale Mono", monospace',
            fontSize: "12px",
          }}
        >
          {logs.length === 0 && (
            <div
              style={{ color: "#666", textAlign: "center", marginTop: "20px" }}
            >
              No logs recorded yet...
            </div>
          )}
          {logs.map((log, i) => (
            <div
              key={i}
              style={{
                marginBottom: "6px",
                borderBottom: "1px solid #222",
                paddingBottom: "4px",
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
              }}
            >
              <span style={{ color: "#666", minWidth: "70px" }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span
                style={{
                  color:
                    log.level === LogLevel.ERROR
                      ? "#ff5252"
                      : log.level === LogLevel.WARN
                        ? "#ffab40"
                        : log.level === LogLevel.INFO
                          ? "#69f0ae"
                          : "#40c4ff",
                  fontWeight: "bold",
                  minWidth: "50px",
                }}
              >
                {LogLevel[log.level]}
              </span>
              <span
                style={{
                  color: "#b0bec5",
                  minWidth: "100px",
                  maxWidth: "100px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                [{log.component}]
              </span>
              <span
                style={{ color: "#e0e0e0", flex: 1, wordBreak: "break-word" }}
              >
                {log.message}
                {log.data && Object.keys(log.data).length > 0 && (
                  <details style={{ marginTop: "5px" }}>
                    <summary style={{ cursor: "pointer", color: "#888" }}>
                      Details
                    </summary>
                    <pre
                      style={{
                        margin: "5px 0 0",
                        padding: "5px",
                        backgroundColor: "#111",
                        overflowX: "auto",
                        fontSize: "11px",
                      }}
                    >
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </details>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
