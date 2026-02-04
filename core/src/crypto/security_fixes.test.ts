/**
 * Verification tests for security fixes in X3DH and Peer Discovery
 */

import { X3DHKeyManager, initiateX3DH, verifyPrekeyBundle } from "./x3dh";
import { generateIdentity } from "./primitives";
import { EnhancedPeerDiscovery, DiscoveryMethod } from "../discovery/enhanced";

describe("X3DH and Discovery Security Fixes", () => {
  describe("Vulnerability 1: Replay Attack Protection", () => {
    it("should reject expired prekey bundles", () => {
      const identity = generateIdentity();
      const manager = new X3DHKeyManager();
      manager.generateKeyBundle(identity);
      const bundle = manager.getPublicBundle("test")!;

      // Valid bundle
      expect(verifyPrekeyBundle(bundle)).toBe(true);

      // Expired bundle (25 hours ago)
      bundle.timestamp = Date.now() - 25 * 60 * 60 * 1000;
      expect(verifyPrekeyBundle(bundle)).toBe(false);

      // Future bundle
      bundle.timestamp = Date.now() + 10000;
      expect(verifyPrekeyBundle(bundle)).toBe(false);
    });
  });

  describe("Vulnerability 5: Predictable OTP Selection", () => {
    it("should selected random OTPs when multiple are available", () => {
      const aliceIdentity = generateIdentity();
      const bobIdentity = generateIdentity();
      const bobManager = new X3DHKeyManager();
      bobManager.generateKeyBundle(bobIdentity);
      const bobBundle = bobManager.getPublicBundle("bob")!;

      // Ensure we have at least 2 OTPs
      expect(bobBundle.oneTimePrekeyPublics.length).toBeGreaterThan(1);

      const pickedIds = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const result = initiateX3DH(aliceIdentity, bobBundle);
        if (result.usedOneTimePrekeyId) {
          pickedIds.add(result.usedOneTimePrekeyId);
        }
      }

      // If selection is random, we should have picked multiple different OTPs in 50 trials
      expect(pickedIds.size).toBeGreaterThan(1);
    });
  });

  describe("Vulnerability 4: DHT Input Validation", () => {
    it("should reject malformed DHT records", async () => {
      const discovery = new EnhancedPeerDiscovery();
      const mockDht = {
        findValue: jest.fn().mockResolvedValue({
          data: new TextEncoder().encode(
            JSON.stringify({
              // Missing peerId, addresses, etc.
              garbage: "data",
            }),
          ),
        }),
      };
      discovery.setDHT(mockDht as any);

      const result = await (discovery as any).lookupDHT("peer-1");
      expect(result).toBeNull();

      // Check with wrong types
      mockDht.findValue.mockResolvedValue({
        data: new TextEncoder().encode(
          JSON.stringify({
            peerId: 123, // Should be string
            addresses: "somewhere", // Should be array
            timestamp: "now", // Should be number
          }),
        ),
      });

      const result2 = await (discovery as any).lookupDHT("peer-2");
      expect(result2).toBeNull();
    });
  });
});
