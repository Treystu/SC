import { Handler } from "@netlify/functions";
import { connectToDatabase } from "./utils/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface SupernodeInfo {
  id: string;
  publicKey: string;
  capabilities: {
    isStable: boolean;
    hasPublicIP: boolean;
    bandwidthMbps: number;
    uptime: number;
    canRelay: boolean;
    supportsWebRTC: boolean;
    supportsWebSocket: boolean;
  };
  endpoints: {
    webrtc?: string;
    websocket?: string;
    http?: string;
  };
  lastSeen: Date;
  metadata?: {
    region?: string;
    version?: string;
  };
}

/**
 * Bootstrap endpoint for new nodes joining the mesh network
 * 
 * Web deployments (Netlify) act as supernodes with:
 * - Stable public endpoints
 * - High uptime
 * - Better bandwidth
 * - Can act as relay/rendezvous servers
 * 
 * This endpoint provides:
 * 1. List of active supernodes for initial connection
 * 2. WebRTC signaling coordination
 * 3. Peer discovery and announcement
 */
export const handler: Handler = async (event, context) => {
  const requestId = context.awsRequestId || `bootstrap-${Date.now()}`;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const db = await connectToDatabase();
    const supernodesCollection = db.collection("supernodes");
    const peersCollection = db.collection("peers");

    // GET: Return list of active supernodes for bootstrap
    if (event.httpMethod === "GET") {
      const activeWindow = 10; // 10 minutes for supernodes (more stable)
      const timeAgo = new Date(Date.now() - activeWindow * 60 * 1000);

      // Get supernodes first (prioritize stable nodes)
      const supernodes = await supernodesCollection
        .find({ lastSeen: { $gt: timeAgo } })
        .sort({ "capabilities.uptime": -1 }) // Highest uptime first
        .limit(10)
        .toArray();

      // Get regular peers as fallback
      const regularPeers = await peersCollection
        .find({ lastSeen: { $gt: new Date(Date.now() - 5 * 60 * 1000) } })
        .limit(20)
        .toArray();

      const bootstrapNodes = [
        ...supernodes.map((s: any) => ({
          id: s.id || s._id,
          type: "supernode",
          publicKey: s.publicKey,
          capabilities: s.capabilities,
          endpoints: s.endpoints,
          metadata: s.metadata,
        })),
        ...regularPeers.map((p: any) => ({
          id: p.id || p._id,
          type: "peer",
          metadata: p.metadata,
        })),
      ];

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          bootstrapNodes,
          timestamp: Date.now(),
          ttl: 300, // 5 minutes cache
        }),
      };
    }

    // POST: Register as supernode or announce peer
    if (event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Missing body" }),
        };
      }

      const body = JSON.parse(event.body);
      const { action, nodeInfo } = body;

      if (action === "register_supernode") {
        // Register this deployment as a supernode
        const supernodeInfo: SupernodeInfo = {
          id: nodeInfo.id,
          publicKey: nodeInfo.publicKey,
          capabilities: {
            isStable: true, // Web deployments are stable
            hasPublicIP: true, // Netlify provides public endpoints
            bandwidthMbps: nodeInfo.capabilities?.bandwidthMbps || 100,
            uptime: nodeInfo.capabilities?.uptime || 0,
            canRelay: true,
            supportsWebRTC: true,
            supportsWebSocket: true,
          },
          endpoints: {
            http: nodeInfo.endpoints?.http || event.headers.origin,
            webrtc: nodeInfo.endpoints?.webrtc,
            websocket: nodeInfo.endpoints?.websocket,
          },
          lastSeen: new Date(),
          metadata: {
            region: nodeInfo.metadata?.region || "unknown",
            version: nodeInfo.metadata?.version || "1.0.0",
          },
        };

        await supernodesCollection.updateOne(
          { id: supernodeInfo.id },
          { $set: supernodeInfo },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            message: "Supernode registered",
            nodeId: supernodeInfo.id,
          }),
        };
      }

      if (action === "announce_peer") {
        // Regular peer announcement
        await peersCollection.updateOne(
          { _id: nodeInfo.id },
          {
            $set: {
              lastSeen: new Date(),
              metadata: nodeInfo.metadata || {},
            },
          },
          { upsert: true }
        );

        return {
          statusCode: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          body: JSON.stringify({
            success: true,
            message: "Peer announced",
          }),
        };
      }

      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Unknown action" }),
      };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error) {
    console.error(`[${requestId}] Bootstrap error:`, error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
