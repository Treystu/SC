import { Handler } from "@netlify/functions";
import { connectToDatabase } from "./utils/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const handler: Handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  try {
    const db = await connectToDatabase();
    const peersCollection = db.collection("peers");
    const signalsCollection = db.collection("signals");
    const messagesCollection = db.collection("messages");

    // Parse body
    const body = event.body ? JSON.parse(event.body) : {};
    const { action, peerId, payload } = body;

    // Basic Validation
    if (!action) {
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
        await peersCollection.updateOne(
          { _id: peerId as any },
          {
            $set: {
              lastSeen: new Date(),
              metadata: payload?.metadata || {},
            },
          },
          { upsert: true },
        );

        // Get active peers (last 5 mins)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activePeers = await peersCollection
          .find({ lastSeen: { $gt: fiveMinutesAgo }, _id: { $ne: peerId } })
          .project({ _id: 1, metadata: 1 })
          .toArray();

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({ peers: activePeers }),
        };
      }

      case "signal": {
        // Store signal for another peer
        const { to, type, signal } = payload;
        if (!to || !type || !signal) throw new Error("Invalid signal payload");

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

        // Update heartbeat
        await peersCollection.updateOne(
          { _id: peerId as any },
          { $set: { lastSeen: new Date() } },
        );

        // Fetch unread signals
        const signals = await signalsCollection
          .find({ to: peerId, read: false })
          .toArray();

        // Mark signals as read (or delete them)
        if (signals.length > 0) {
          await signalsCollection.updateMany(
            { _id: { $in: signals.map((s: any) => s._id) } },
            { $set: { read: true } },
          );
        }

        // Fetch public messages
        // If 'since' is provided, get messages after that timestamp
        // Otherwise, get last 50
        let messageQuery: any = {};
        if (since) {
          messageQuery.timestamp = { $gt: new Date(since) };
        }

        const messages = await messagesCollection
          .find(messageQuery)
          .sort({ timestamp: -1 }) // Newest first to limit
          .limit(since ? 1000 : 50) // Higher limit if syncing, lower if initial load
          .toArray();

        // Get active peers (last 5 mins) to keep client updated
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const activePeers = await peersCollection
          .find({ lastSeen: { $gt: fiveMinutesAgo }, _id: { $ne: peerId } })
          .project({ _id: 1, metadata: 1 })
          .toArray();

        return {
          statusCode: 200,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            signals: signals.map((s: any) => ({
              ...s,
              id: s._id.toString(),
              _id: undefined,
            })),
            messages: messages
              .reverse()
              .map((m: any) => ({
                ...m,
                id: m._id.toString(),
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
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ error: "Invalid action" }),
        };
    }
  } catch (error) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
