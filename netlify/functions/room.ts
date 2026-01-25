import { Handler } from "@netlify/functions";
import { connectToDatabase, cleanupExpiredData } from "./utils/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const handler: Handler = async (event, context) => {
  // Request ID for correlation
  const requestId = context.awsRequestId || `req-${Date.now()}`;
  console.log(
    `[${requestId}] Function invoked: ${event.httpMethod} ${event.path}`,
  );

  if (event.httpMethod === "OPTIONS") {
    console.log(`[${requestId}] Handling OPTIONS request`);
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  // Handle plain GET for simple bootstrapping (HttpBootstrapProvider compatibility)
  if (event.httpMethod === "GET") {
    try {
      console.log(`[${requestId}] Handling GET bootstrap request`);
      const db = await connectToDatabase();
      const peersCollection = db.collection("peers");

      // Get active peers (last 5 mins)
      const activeWindow = 5;
      const timeAgo = new Date(Date.now() - activeWindow * 60 * 1000);

      const activePeers = await peersCollection
        .find({ lastSeen: { $gt: timeAgo } })
        .project({ _id: 1, metadata: 1 })
        .limit(50) // Cap at 50 for bootstrap
        .toArray();

      // Remap _id to id for consistency with DiscoveryPeer interface
      const peers = activePeers.map((p: any) => ({
        id: p._id,
        transportType: "webrtc", // Default for now
        ...p,
      }));

      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ peers }),
      };
    } catch (error) {
      console.error(`[${requestId}] GET Error:`, error);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  }

  try {
    console.log(`[${requestId}] Connecting to database...`);
    const db = await connectToDatabase();
    console.log(`[${requestId}] Database connected successfully`);

    // Cleanup expired data periodically (in-memory adapter only)
    cleanupExpiredData();

    const peersCollection = db.collection("peers");
    const signalsCollection = db.collection("signals");
    const messagesCollection = db.collection("messages");

    // Parse body
    if (!event.body) {
      console.warn(`[${requestId}] Missing request body`);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing body" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      console.error(`[${requestId}] Failed to parse JSON body:`, e);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid JSON" }),
      };
    }

    const { action, payload } = body;
    let { peerId } = body;

    if (peerId) {
      // Normalize ID: no spaces, uppercase for consistency
      peerId = peerId.replace(/\s/g, "").toUpperCase();
    }
    console.log(`[${requestId}] Action: ${action}, PeerId: ${peerId}`);

    // Basic Validation
    if (!action) {
      console.warn(`[${requestId}] Create Error: Missing action`);
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing action" }),
      };
    }

    switch (action) {
      case "join": {
        // Register/Update Peer
        if (!peerId) throw new Error("Missing peerId");

        // Log the metadata being stored to ensure key exchange info is present
        const metadata = payload?.metadata || {};
        console.log(
          `[${requestId}] Processing join for ${peerId}. Metadata update:`,
          JSON.stringify(metadata).substring(0, 200),
        );

        await peersCollection.updateOne(
          { _id: peerId },
          {
            $set: {
              lastSeen: new Date(),
              metadata: metadata,
            },
          },
          { upsert: true },
        );

        // Get active peers (last 2 mins - increased from 5 to help bootstrapping)
        const activeWindow = 2;
        const timeAgo = new Date(Date.now() - activeWindow * 60 * 1000);

        const activePeers = await peersCollection
          .find({ lastSeen: { $gt: timeAgo }, _id: { $ne: peerId } })
          .project({ _id: 1, metadata: 1 })
          .toArray();

        console.log(
          `[${requestId}] Found ${activePeers.length} active peers (last ${activeWindow} mins)`,
        );

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ peers: activePeers }),
        };
      }

      case "signal": {
        // Store signal for another peer
        const { type, signal } = payload;
        let { to } = payload;
        if (!to || !type || !signal) throw new Error("Invalid signal payload");

        // Normalize recipient ID: no spaces, uppercase for consistency
        to = to.replace(/\s/g, "").toUpperCase();

        console.log(
          `[${requestId}] Processing signal from ${peerId} to ${to} (${type}) - Length: ${JSON.stringify(signal).length} chars`,
        );
        if (type === "offer" || type === "answer") {
          console.log(
            `[${requestId}] SDP Type: ${type}, SDP content present: ${!!signal.sdp}`,
          );
        } else if (type === "candidate") {
          console.log(
            `[${requestId}] ICE Candidate: ${signal.candidate ? "present" : "missing"}`,
          );
        }

        await signalsCollection.insertOne({
          from: peerId,
          to,
          type,
          signal,
          timestamp: new Date(),
          read: false,
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: true }),
        };
      }

      case "poll": {
        // Get pending signals and messages
        if (!peerId) throw new Error("Missing peerId");
        const { since } = payload || {};

        // Quiet logging for poll to reduce noise, unless specific debug flag
        // console.log(`[${requestId}] polling for ${peerId}`);

        // Update heartbeat (with upsert to ensure presence persists)
        await peersCollection.updateOne(
          { _id: peerId },
          { $set: { lastSeen: new Date() } },
          { upsert: true },
        );

        // Fetch unread signals
        const signals = await signalsCollection
          .find({ to: peerId, read: false })
          .toArray();

        if (signals.length > 0) {
          console.log(
            `[${requestId}] Found ${signals.length} unread signals for ${peerId}`,
          );
        }

        // Mark signals as read (or delete them)
        if (signals.length > 0) {
          await signalsCollection.updateMany(
            { _id: { $in: signals.map((s: any) => s._id) } },
            { $set: { read: true } },
          );
        }

        // Fetch pending relayed DMs for this peer
        // IMPORTANT: Exclude messages FROM this peer (loopback prevention)
        const dmsCollection = db.collection("dms");
        const pendingDms = await dmsCollection
          .find({ to: peerId, from: { $ne: peerId }, read: false })
          .sort({ timestamp: 1 }) // Oldest first for correct order
          .limit(100)
          .toArray();

        if (pendingDms.length > 0) {
          console.log(
            `[${requestId}] Found ${pendingDms.length} pending relayed DMs for ${peerId}`,
          );
          // Mark DMs as read
          await dmsCollection.updateMany(
            { _id: { $in: pendingDms.map((d: any) => d._id) } },
            { $set: { read: true } },
          );
        }

        // Fetch public messages
        const messageQuery: Record<string, any> = {};
        if (since) {
          messageQuery.timestamp = { $gt: new Date(since) };
        }

        const messages = await messagesCollection
          .find(messageQuery)
          .sort({ timestamp: -1 }) // Newest first
          .limit(since ? 1000 : 50)
          .toArray();

        // Get active peers (last 2 mins) to keep client updated
        const activeWindow = 2;
        const timeAgo = new Date(Date.now() - activeWindow * 60 * 1000);
        const activePeers = await peersCollection
          .find({ lastSeen: { $gt: timeAgo }, _id: { $ne: peerId } })
          .project({ _id: 1, metadata: 1 })
          .toArray();

        // If we have messages, log count
        if (messages.length > 0) {
          // console.log(`[${requestId}] Returning ${messages.length} messages`);
        }

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            signals: (signals || []).map((s: any) => ({
              ...s,
              id: s?._id?.toString(),
              _id: undefined,
            })),
            messages: (messages || []).reverse().map((m: any) => ({
              ...m,
              id: m?._id?.toString(),
              _id: undefined,
            })),
            dms: (pendingDms || []).map((d: any) => ({
              ...d,
              id: d?._id?.toString(),
              _id: undefined,
            })),
            peers: activePeers,
          }),
        };
      }

      case "message": {
        // Post a public message with delivery confirmation
        const { content, messageId } = payload;
        if (!content) throw new Error("Missing content");

        // Generate unique message ID if not provided
        const finalMessageId =
          messageId ||
          `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log(
          `[${requestId}] Processing message ${finalMessageId} from ${peerId}`,
        );

        // Insert message with timestamp and ID for tracking
        const result = await messagesCollection.insertOne({
          id: finalMessageId,
          from: peerId,
          content,
          timestamp: new Date(),
          deliveredTo: [], // Track which peers have received this message
        });

        if (result.acknowledged) {
          console.log(
            `[${requestId}] Message ${finalMessageId} stored successfully`,
          );
        }

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            messageId: finalMessageId,
            timestamp: new Date().toISOString(),
          }),
        };
      }

      case "dm": {
        // Relay a direct/private message when P2P WebRTC fails
        // The message content is already encrypted end-to-end by the client
        let { to } = payload;
        const { content, messageId } = payload;
        if (!to || !content) throw new Error("Missing to or content for dm");
        if (!peerId) throw new Error("Missing peerId");

        // Normalize recipient ID
        to = to.replace(/\s/g, "").toUpperCase();

        const finalMessageId =
          messageId ||
          `dm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log(
          `[${requestId}] Relaying DM ${finalMessageId} from ${peerId} to ${to}`,
        );

        // VALIDATION: Prevent self-sending (belt and suspenders)
        if (peerId === to) {
          console.warn(
            `[${requestId}] Rejected self-send DM attempt: from=${peerId} to=${to}`,
          );
          return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: "Cannot send DM to yourself" }),
          };
        }

        // Store in a separate "dms" collection for private messages
        const dmsCollection = db.collection("dms");
        await dmsCollection.insertOne({
          id: finalMessageId,
          from: peerId,
          to: to,
          content: content, // Already encrypted by client
          timestamp: new Date(),
          read: false,
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            success: true,
            messageId: finalMessageId,
            timestamp: new Date().toISOString(),
            relayed: true, // Indicate this was a relay delivery
          }),
        };
      }

      default:
        console.warn(`[${requestId}] Unknown action: ${action}`);
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Invalid action" }),
        };
    }
  } catch (error) {
    console.error(`[${requestId}] Critical Error:`, error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
