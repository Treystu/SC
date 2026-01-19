/**
 * Silent Mesh Tests
 *
 * Verifies the Silent Mesh architecture:
 * 1. Aggressive Connection: Auto-connect to discoverable peers as mesh nodes
 * 2. Social Silence: Never create Contacts without user action
 * 3. Eternal Ledger: Persistent node history survives identity resets
 */

import {
  EternalLedger,
  MemoryLedgerAdapter,
  type KnownNode,
} from '../ledger.js';

import {
  SilentMeshManager,
} from '../silent-mesh.js';

describe('Silent Mesh', () => {
  describe('Eternal Ledger', () => {
    let ledger: EternalLedger;

    beforeEach(() => {
      ledger = new EternalLedger(new MemoryLedgerAdapter());
    });

    it('should persist node sightings', async () => {
      const nodeId = 'ABCD1234EFGH5678';

      await ledger.recordNodeSighting(nodeId, {
        publicKey: 'test-public-key-hex',
        ipAddress: '192.168.1.100',
        connectionSuccessful: true,
      });

      const node = await ledger.getNode(nodeId);
      expect(node).toBeDefined();
      expect(node?.nodeId).toBe(nodeId);
      expect(node?.publicKey).toBe('test-public-key-hex');
      expect(node?.lastKnownIP).toBe('192.168.1.100');
      expect(node?.connectionCount).toBe(1);
      expect(node?.lastConnectionSuccess).toBe(true);
    });

    it('should normalize peer IDs to uppercase', async () => {
      const nodeIdLower = 'abcd1234efgh5678';
      const nodeIdUpper = 'ABCD1234EFGH5678';

      await ledger.recordNodeSighting(nodeIdLower, {});

      const node = await ledger.getNode(nodeIdUpper);
      expect(node).toBeDefined();
      expect(node?.nodeId).toBe(nodeIdUpper);
    });

    it('should update existing nodes on subsequent sightings', async () => {
      const nodeId = 'ABCD1234EFGH5678';

      // First sighting
      await ledger.recordNodeSighting(nodeId, {
        publicKey: 'key1',
        connectionSuccessful: true,
      });

      // Second sighting
      await ledger.recordNodeSighting(nodeId, {
        publicKey: 'key2', // Should update
        connectionSuccessful: false,
      });

      const node = await ledger.getNode(nodeId);
      expect(node?.connectionCount).toBe(2);
      expect(node?.publicKey).toBe('key2');
      expect(node?.lastConnectionSuccess).toBe(false);
    });

    it('should validate node identity against stored public key', async () => {
      const nodeId = 'ABCD1234EFGH5678';

      await ledger.recordNodeSighting(nodeId, {
        publicKey: 'original-key',
      });

      // Same key should be valid
      expect(await ledger.validateNodeIdentity(nodeId, 'original-key')).toBe(true);

      // Different key should be invalid (potential spoofing)
      expect(await ledger.validateNodeIdentity(nodeId, 'different-key')).toBe(false);

      // New node should be valid
      expect(await ledger.validateNodeIdentity('NEWNODE123456789', 'any-key')).toBe(true);
    });

    it('should return recently active nodes', async () => {
      // Add nodes with different timestamps
      const adapter = new MemoryLedgerAdapter();
      ledger = new EternalLedger(adapter);

      await ledger.recordNodeSighting('NODE1111111111111', {});
      await ledger.recordNodeSighting('NODE2222222222222', {});

      const recentNodes = await ledger.getRecentlyActiveNodes(60000); // Last minute
      expect(recentNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should track gateway associations', async () => {
      const gatewayId = 'GATEWAY123456789';
      const nodeId = 'CLIENT123456789';

      await ledger.recordNodeSighting(nodeId, {
        gatewayId,
      });

      const nodesByGateway = await ledger.getNodesByGateway(gatewayId);
      expect(nodesByGateway.length).toBe(1);
      expect(nodesByGateway[0].nodeId).toBe(nodeId);
    });

    it('should provide accurate statistics', async () => {
      await ledger.recordNodeSighting('NODE1111111111111', {});
      await ledger.recordNodeSighting('NODE2222222222222', {});
      await ledger.recordNodeSighting('NODE3333333333333', {});

      const stats = await ledger.getStats();
      expect(stats.totalNodes).toBe(3);
      expect(stats.activeNodes).toBe(3); // All just added
    });
  });

  describe('Silent Mesh Manager', () => {
    let silentMesh: SilentMeshManager;

    beforeEach(() => {
      const ledger = new EternalLedger(new MemoryLedgerAdapter());
      silentMesh = new SilentMeshManager(ledger);
    });

    describe('Mesh Neighbors (Technical Connections)', () => {
      it('should add mesh neighbors without creating contacts', async () => {
        const peerId = 'PEER1234567890AB';

        const neighbor = await silentMesh.addMeshNeighbor(peerId, {
          publicKey: 'test-key',
          transportType: 'webrtc',
          source: 'discovery',
        });

        expect(neighbor.peerId).toBe(peerId);
        expect(silentMesh.getMeshNeighborCount()).toBe(1);

        // Potential contacts should be empty
        expect(silentMesh.getPotentialContacts().length).toBe(0);
      });

      it('should update existing neighbors on reconnect', async () => {
        const peerId = 'PEER1234567890AB';

        await silentMesh.addMeshNeighbor(peerId, {
          publicKey: 'key1',
        });

        // Simulate reconnection with updated info
        await silentMesh.addMeshNeighbor(peerId, {
          publicKey: 'key2',
          relayCapable: false,
        });

        // Should still be one neighbor
        expect(silentMesh.getMeshNeighborCount()).toBe(1);

        const neighbors = silentMesh.getMeshNeighbors();
        expect(neighbors[0].publicKey).toBe('key2');
        expect(neighbors[0].relayCapable).toBe(false);
      });

      it('should track neighbor activity', async () => {
        const peerId = 'PEER1234567890AB';

        await silentMesh.addMeshNeighbor(peerId, {});

        // Update activity
        silentMesh.updateNeighborActivity(peerId, 1000);

        const neighbors = silentMesh.getMeshNeighbors();
        expect(neighbors[0].bytesRelayed).toBe(1000);
      });

      it('should remove mesh neighbors on disconnect', async () => {
        const peerId = 'PEER1234567890AB';

        await silentMesh.addMeshNeighbor(peerId, {});
        expect(silentMesh.getMeshNeighborCount()).toBe(1);

        silentMesh.removeMeshNeighbor(peerId);
        expect(silentMesh.getMeshNeighborCount()).toBe(0);
      });

      it('should filter active mesh neighbors', async () => {
        const peer1 = 'PEER1111111111111';
        const peer2 = 'PEER2222222222222';

        await silentMesh.addMeshNeighbor(peer1, {});
        await silentMesh.addMeshNeighbor(peer2, {});

        // Mark one as offline
        silentMesh.updateNeighborQuality(peer1, 'offline');

        const activeNeighbors = silentMesh.getActiveMeshNeighbors();
        expect(activeNeighbors.length).toBe(1);
        expect(activeNeighbors[0].peerId).toBe(peer2);
      });
    });

    describe('Potential Social Contacts', () => {
      it('should record potential contacts separately from mesh neighbors', async () => {
        const peerId = 'PEER1234567890AB';

        await silentMesh.recordPotentialContact(peerId, {
          displayName: 'Alice',
          publicKey: 'alice-key',
        });

        const potentialContacts = silentMesh.getPotentialContacts();
        expect(potentialContacts.length).toBe(1);
        expect(potentialContacts[0].displayName).toBe('Alice');
        expect(potentialContacts[0].promoted).toBe(false);

        // Mesh neighbors should be empty
        expect(silentMesh.getMeshNeighborCount()).toBe(0);
      });

      it('should track incoming messages from potential contacts', async () => {
        const peerId = 'PEER1234567890AB';

        await silentMesh.recordPotentialContact(peerId, {});

        // Simulate receiving a message
        silentMesh.recordIncomingMessage(peerId);

        const potentialContacts = silentMesh.getPotentialContacts();
        expect(potentialContacts[0].hasMessaged).toBe(true);
        expect(potentialContacts[0].messageCount).toBe(1);
      });

      it('should identify pending message requests', async () => {
        const peer1 = 'PEER1111111111111';
        const peer2 = 'PEER2222222222222';

        await silentMesh.recordPotentialContact(peer1, {});
        await silentMesh.recordPotentialContact(peer2, {});

        // Only peer1 has messaged
        silentMesh.recordIncomingMessage(peer1);

        const pendingRequests = silentMesh.getPendingMessageRequests();
        expect(pendingRequests.length).toBe(1);
        expect(pendingRequests[0].peerId).toBe(peer1);
      });

      it('should mark contacts as promoted', async () => {
        const peerId = 'PEER1234567890AB';

        await silentMesh.recordPotentialContact(peerId, {});
        silentMesh.recordIncomingMessage(peerId);

        // User promotes to contact
        silentMesh.markAsPromoted(peerId);

        // Should no longer be in pending requests
        const pendingRequests = silentMesh.getPendingMessageRequests();
        expect(pendingRequests.length).toBe(0);

        // But should still be in potential contacts list
        const potentialContacts = silentMesh.getPotentialContacts();
        expect(potentialContacts[0].promoted).toBe(true);
      });
    });

    describe('Watering Hole Delivery', () => {
      it('should store messages for offline nodes', async () => {
        const destination = 'OFFLINE123456789';
        const messageId = 'msg-001';
        const message = new TextEncoder().encode('Hello offline node!');

        await silentMesh.storeWateringHoleMessage(
          messageId,
          destination,
          message,
          ['GATEWAY123456789']
        );

        expect(silentMesh.getWateringHoleCount()).toBe(1);
      });

      it('should find messages when destination connects', async () => {
        const destination = 'OFFLINE123456789';
        const messageId = 'msg-001';
        const message = new TextEncoder().encode('Hello!');

        await silentMesh.storeWateringHoleMessage(messageId, destination, message);

        // Destination comes online
        const messages = await silentMesh.checkWateringHoleDelivery(destination);
        expect(messages.length).toBe(1);
        expect(messages[0].messageId).toBe(messageId);
      });

      it('should find messages via gateway relay', async () => {
        const destination = 'OFFLINE123456789';
        const gateway = 'GATEWAY123456789';
        const messageId = 'msg-001';
        const message = new TextEncoder().encode('Hello via gateway!');

        await silentMesh.storeWateringHoleMessage(
          messageId,
          destination,
          message,
          [gateway]
        );

        // Gateway connects (not the destination directly)
        const messages = await silentMesh.checkWateringHoleDelivery(gateway);
        expect(messages.length).toBe(1);
      });

      it('should remove messages after delivery', async () => {
        const messageId = 'msg-001';

        await silentMesh.storeWateringHoleMessage(
          messageId,
          'DESTINATION123456',
          new Uint8Array(10)
        );

        silentMesh.markWateringHoleDelivered(messageId);
        expect(silentMesh.getWateringHoleCount()).toBe(0);
      });
    });

    describe('Light Ping Protocol', () => {
      it('should return targets from ledger', async () => {
        const ledger = silentMesh.getLedger();

        // Add some nodes to the ledger
        await ledger.recordNodeSighting('NODE1111111111111', {});
        await ledger.recordNodeSighting('NODE2222222222222', {});

        const targets = await silentMesh.getLightPingTargets(10);
        expect(targets.length).toBe(2);
      });

      it('should execute Light Ping with callback', async () => {
        const ledger = silentMesh.getLedger();

        // Add nodes to the ledger
        await ledger.recordNodeSighting('NODE1111111111111', {});
        await ledger.recordNodeSighting('NODE2222222222222', {});

        // Mock connection callback
        const connectCallback = jest.fn()
          .mockResolvedValueOnce(true)  // First node succeeds
          .mockResolvedValueOnce(false); // Second node fails

        const results = await silentMesh.performLightPing(connectCallback);

        expect(results.attempted).toBe(2);
        expect(results.successful).toBe(1);
        expect(results.nodes.length).toBe(1);
        expect(connectCallback).toHaveBeenCalledTimes(2);
      });

      it('should handle empty ledger gracefully', async () => {
        const connectCallback = jest.fn();

        const results = await silentMesh.performLightPing(connectCallback);

        expect(results.attempted).toBe(0);
        expect(results.successful).toBe(0);
        expect(connectCallback).not.toHaveBeenCalled();
      });
    });

    describe('Device Profile Awareness', () => {
      it('should return discovery configuration', () => {
        const config = silentMesh.getDiscoveryConfig();

        expect(config.pollInterval).toBeGreaterThan(0);
        expect(config.maxParallelConnections).toBeGreaterThan(0);
        expect(typeof config.enableAggressiveDiscovery).toBe('boolean');
        expect(typeof config.lightPingEnabled).toBe('boolean');
        expect(config.lightPingInterval).toBeGreaterThan(0);
      });
    });

    describe('Statistics', () => {
      it('should provide accurate statistics', async () => {
        // Add mesh neighbors
        await silentMesh.addMeshNeighbor('MESH111111111111', {});
        await silentMesh.addMeshNeighbor('MESH222222222222', {});

        // Add potential contacts
        await silentMesh.recordPotentialContact('SOCIAL1111111111', {});

        const stats = await silentMesh.getStats();

        expect(stats.meshNeighbors).toBe(2);
        expect(stats.potentialContacts).toBe(1);
        expect(stats.ledgerNodes).toBeGreaterThanOrEqual(2); // Mesh neighbors recorded in ledger
      });
    });

    describe('Reset Behavior', () => {
      it('should reset mesh state but preserve ledger', async () => {
        const ledger = silentMesh.getLedger();

        // Add data
        await silentMesh.addMeshNeighbor('MESH111111111111', {});
        await silentMesh.recordPotentialContact('SOCIAL1111111111', {});
        await silentMesh.storeWateringHoleMessage('msg1', 'DEST1111111111111', new Uint8Array(10));

        // Verify ledger has entries
        const statsBefore = await ledger.getStats();
        expect(statsBefore.totalNodes).toBeGreaterThan(0);

        // Reset mesh state
        silentMesh.reset();

        // Mesh state should be cleared
        expect(silentMesh.getMeshNeighborCount()).toBe(0);
        expect(silentMesh.getPotentialContacts().length).toBe(0);
        expect(silentMesh.getWateringHoleCount()).toBe(0);

        // Ledger should be preserved (key Silent Mesh principle!)
        const statsAfter = await ledger.getStats();
        expect(statsAfter.totalNodes).toBe(statsBefore.totalNodes);
      });
    });
  });

  describe('Silent Mesh Scenarios', () => {
    it('SCENARIO: User A joins room with User B - verify mesh vs contacts', async () => {
      const ledger = new EternalLedger(new MemoryLedgerAdapter());
      const silentMesh = new SilentMeshManager(ledger);

      const userB = 'USERB222222222222';

      // User B is discovered and connected as mesh neighbor (automatic)
      await silentMesh.addMeshNeighbor(userB, {
        publicKey: 'userb-public-key',
        source: 'discovery',
      });

      // ASSERT: User A's activeMeshPeers count is 1
      expect(silentMesh.getMeshNeighborCount()).toBe(1);

      // ASSERT: User A's ContactList is 0 (no UI contacts created)
      expect(silentMesh.getPotentialContacts().filter(c => c.promoted).length).toBe(0);

      // ASSERT: User A's KnownNodes ledger contains User B's ID
      const node = await ledger.getNode(userB);
      expect(node).toBeDefined();
      expect(node?.nodeId).toBe(userB);
    });

    it('SCENARIO: Identity reset retains ledger', async () => {
      const adapter = new MemoryLedgerAdapter();
      const ledger = new EternalLedger(adapter);
      let silentMesh = new SilentMeshManager(ledger);

      const knownPeer = 'KNOWNPEER12345678';

      // Record a known peer
      await silentMesh.addMeshNeighbor(knownPeer, {
        publicKey: 'known-peer-key',
      });

      // Verify ledger has the node
      expect(await ledger.getNode(knownPeer)).toBeDefined();

      // Simulate identity reset - create new SilentMesh with SAME ledger
      silentMesh.reset(); // Clear mesh state
      silentMesh = new SilentMeshManager(ledger); // "New identity" but same ledger

      // ASSERT: Ledger still contains the known peer (survives identity reset)
      const nodeAfterReset = await ledger.getNode(knownPeer);
      expect(nodeAfterReset).toBeDefined();
      expect(nodeAfterReset?.nodeId).toBe(knownPeer);
    });

    it('SCENARIO: Message to offline peer uses watering hole', async () => {
      const ledger = new EternalLedger(new MemoryLedgerAdapter());
      const silentMesh = new SilentMeshManager(ledger);

      const offlinePeer = 'OFFLINE123456789';
      const gatewayPeer = 'GATEWAY123456789';
      const messageId = 'msg-001';

      // Record that offline peer was last seen via gateway
      await ledger.recordNodeSighting(offlinePeer, {
        gatewayId: gatewayPeer,
      });

      // Store message for offline peer
      await silentMesh.storeWateringHoleMessage(
        messageId,
        offlinePeer,
        new TextEncoder().encode('Hello offline!'),
        [gatewayPeer]
      );

      // Gateway comes online
      await silentMesh.addMeshNeighbor(gatewayPeer, {});

      // Check for deliverable messages
      const messages = await silentMesh.checkWateringHoleDelivery(gatewayPeer);

      // ASSERT: Message should be found for delivery via gateway
      expect(messages.length).toBe(1);
      expect(messages[0].destinationPeerId).toBe(offlinePeer);
    });
  });
});
