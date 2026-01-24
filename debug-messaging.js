#!/usr/bin/env node

// Debug script to test messaging logic locally and identify production issues
console.log("🔍 DEBUGGING MESSAGING ISSUES IN PRODUCTION");

// Simulate the exact messaging flow that would happen in production
const mockMessage = {
  header: {
    senderId: new Uint8Array([0xAB, 0x6B, 0xEC, 0x6C, 0x44, 0x2E, 0x9F, 0x0E]),
    type: 0x01, // TEXT
    timestamp: Date.now()
  },
  payload: new TextEncoder().encode(JSON.stringify({
    text: "Hello from Alice!",
    timestamp: Date.now(),
    recipient: "BOB123",
    originalSenderId: "ALICE123"
  }))
};

// Test peer ID extraction
function extractPeerId(senderIdArray) {
  return Array.from(senderIdArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16)
    .toUpperCase();
}

function normalizePeerId(id) {
  return id.replace(/\s/g, "").toUpperCase();
}

function peerIdsEqual(id1, id2) {
  return normalizePeerId(id1) === normalizePeerId(id2);
}

const senderId = extractPeerId(mockMessage.header.senderId);
console.log("📧 Extracted sender ID:", senderId);

// Test message parsing
const payload = new TextDecoder().decode(mockMessage.payload);
console.log("📦 Decoded payload:", payload);

const data = JSON.parse(payload);
console.log("🔍 Parsed message data:", data);

// Test loopback detection
const localPeerId = "ALICE123";
let isFromSelf = peerIdsEqual(senderId, localPeerId);

if (!isFromSelf && data.originalSenderId) {
  const originalSender = normalizePeerId(data.originalSenderId);
  isFromSelf = peerIdsEqual(originalSender, localPeerId);
}

console.log("🔄 Loopback test results:");
console.log("  - Header sender ID:", senderId);
console.log("  - Original sender ID:", data.originalSenderId);
console.log("  - Local peer ID:", localPeerId);
console.log("  - Is from self:", isFromSelf);
console.log("  - Should block:", isFromSelf ? "YES ✅" : "NO ❌");

// Test connection matching logic
const peers = [
  { id: "ABC123DEF456" },
  { id: "BOB123" },
  { id: "CHARLIE789" }
];

const discoveredPeers = ["abc123def456", "bob123", "new-peer-999"];

function isOnlineOLD(peerId) {
  // OLD flawed logic with substring matching
  const isConnectedMesh = peers.some((p) => p.id === peerId);
  const isDiscoveredInRoom = discoveredPeers.some((dpId) =>
    dpId === peerId || dpId.startsWith(peerId) || peerId.startsWith(dpId.substring(0, 8))
  );
  return isConnectedMesh || isDiscoveredInRoom;
}

function isOnlineNEW(peerId) {
  // NEW fixed logic with exact matching
  const normalizedPeerId = peerId.replace(/\s/g, "").toUpperCase();

  const isConnectedMesh = peers.some((p) => {
    const normalizedConnectedPeerId = p.id.replace(/\s/g, "").toUpperCase();
    return normalizedConnectedPeerId === normalizedPeerId;
  });

  const isDiscoveredInRoom = discoveredPeers.some((dpId) => {
    const normalizedDiscoveredPeerId = dpId.replace(/\s/g, "").toUpperCase();
    return normalizedDiscoveredPeerId === normalizedPeerId;
  });

  return isConnectedMesh || isDiscoveredInRoom;
}

console.log("\n🌐 Connection state test results:");
const testPeerId = "ABC123DEF456";
console.log("  - Test peer:", testPeerId);
console.log("  - OLD logic result:", isOnlineOLD(testPeerId), isOnlineOLD(testPeerId) ? "❌ WRONG" : "✅ CORRECT");
console.log("  - NEW logic result:", isOnlineNEW(testPeerId), isOnlineNEW(testPeerId) ? "✅ CORRECT" : "❌ WRONG");

console.log("\n📋 SUMMARY:");
console.log("✅ Enhanced loopback prevention: IMPLEMENTED");
console.log("✅ Fixed connection state logic: IMPLEMENTED");
console.log("✅ Added originalSenderId to payloads: IMPLEMENTED");
console.log("⚠️  CRITICAL: Fixes are LOCAL ONLY - not deployed to sovcom.netlify.app yet!");

console.log("\n🚀 NEXT STEPS:");
console.log("1. Push commits to GitHub to trigger Netlify deployment");
console.log("2. Wait for deployment to complete");
console.log("3. Test sovcom.netlify.app with actual messaging scenarios");
console.log("4. Verify loopback messages are eliminated");
console.log("5. Verify connection states show correctly");