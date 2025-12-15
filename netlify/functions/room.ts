import { Handler } from "@netlify/functions";
import { connectToDatabase } from "./utils/db";

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

  try {
    console.log(`[${requestId}] Connecting to database...`);
    const db = await connectToDatabase();
    console.log(`[${requestId}] Database connected successfully`);

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
      peerId = peerId.replace(/\s/g, "");
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
        let { to, type, signal } = payload;
        if (!to || !type || !signal) throw new Error("Invalid signal payload");

        // Sanitize recipient ID to match the sanitized peerId validation
        to = to.replace(/\s/g, "");

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

        // Update heartbeat
        await peersCollection.updateOne(
          { _id: peerId },
          { $set: { lastSeen: new Date() } },
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
            peers: activePeers,
          }),
        };
      }

      case "message": {
        // Post a public message
        const { content } = payload;
        if (!content) throw new Error("Missing content");

        console.log(`[${requestId}] Processing message from ${peerId}`);

        await messagesCollection.insertOne({
          from: peerId,
          content,
          timestamp: new Date(),
        });

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ success: true }),
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
