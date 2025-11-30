import { Handler } from "@netlify/functions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler: Handler = async (event, _context) => {
  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { level, message, details, timestamp, peerId } = body;

    // Log to Netlify's function logs (stdout)
    // This is the "single point of truth" viewable in Netlify Dashboard
    const logEntry = {
      timestamp: timestamp || new Date().toISOString(),
      level: level || "INFO",
      peerId: peerId || "anonymous",
      message,
      details,
    };

    // Direct console log for Netlify capture
    console.log(JSON.stringify(logEntry));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Failed to process log entry:", error);
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Invalid log payload" }),
    };
  }
};
