/**
 * Kademlia Routing Table Tests
 */

import { KademliaRoutingTable } from './kademlia';
import type { DHTContact, DHTValue, FindNodeRequest, PingRequest, StoreRequest, FindValueRequest, DHTMessageType } from './types';
import { generateNodeId, nodeIdToHex, nodeIdsEqual, generateDHTKey } from './node-id';

describe('KademliaRoutingTable', () => {
  let routingTable: KademliaRoutingTable;
  let localNodeId: Uint8Array;

  beforeEach(() => {
    localNodeId = generateNodeId();
    routingTable = new KademliaRoutingTable(localNodeId, {
      k: 20,
      alpha: 3,
      pingTimeout: 1000,
    });
  });

  afterEach(() => {
    routingTable.stop();
  });

  function createContact(nodeId?: Uint8Array): DHTContact {
    const id = nodeId || generateNodeId();
    return {
      nodeId: id,
      peerId: nodeIdToHex(id),
      lastSeen: Date.now(),
      failureCount: 0,
    };
  }

  describe('Contact Management', () => {
    it('should add contacts', () => {
      const contact = createContact();
      const result = routingTable.addContact(contact);

      expect(result.added).toBe(true);
      expect(routingTable.getContact(contact.nodeId)).toBeDefined();
    });

    it('should not add self', () => {
      const selfContact = createContact(localNodeId);
      const result = routingTable.addContact(selfContact);

      expect(result.added).toBe(false);
    });

    it('should remove contacts', () => {
      const contact = createContact();
      routingTable.addContact(contact);

      const removed = routingTable.removeContact(contact.nodeId);
      expect(removed).toBe(true);
      expect(routingTable.getContact(contact.nodeId)).toBeUndefined();
    });

    it('should get closest contacts', () => {
      // Add several contacts
      for (let i = 0; i < 10; i++) {
        routingTable.addContact(createContact());
      }

      const target = generateNodeId();
      const closest = routingTable.getClosestContacts(target, 5);

      expect(closest.length).toBeLessThanOrEqual(5);
    });

    it('should get all contacts', () => {
      const contacts = [createContact(), createContact(), createContact()];
      contacts.forEach(c => routingTable.addContact(c));

      const all = routingTable.getAllContacts();
      expect(all.length).toBe(3);
    });
  });

  describe('Local Storage', () => {
    it('should store values locally', () => {
      const key = generateDHTKey('test-key');
      const value: DHTValue = {
        data: new Uint8Array([1, 2, 3]),
        storedAt: Date.now(),
        ttl: 3600000,
        publisherId: localNodeId,
      };

      routingTable.storeLocal(key, value);
      const retrieved = routingTable.getLocal(key);

      expect(retrieved).toBeDefined();
      expect(retrieved!.data).toEqual(value.data);
    });

    it('should return undefined for non-existent keys', () => {
      const key = generateDHTKey('non-existent');
      expect(routingTable.getLocal(key)).toBeUndefined();
    });
  });

  describe('Request Handlers', () => {
    describe('handleFindNode', () => {
      it('should return closest nodes', () => {
        // Add some contacts
        for (let i = 0; i < 5; i++) {
          routingTable.addContact(createContact());
        }

        const targetId = generateNodeId();
        const request: FindNodeRequest = {
          type: 'FIND_NODE' as DHTMessageType.FIND_NODE,
          senderId: generateNodeId(),
          messageId: 'test-1',
          timestamp: Date.now(),
          targetId,
        };

        const response = routingTable.handleFindNode(request);

        expect(response.type).toBe('FIND_NODE_RESPONSE');
        expect(response.messageId).toBe('test-1');
        expect(Array.isArray(response.nodes)).toBe(true);
      });

      it('should update sender contact info', () => {
        const senderId = generateNodeId();
        const request: FindNodeRequest = {
          type: 'FIND_NODE' as DHTMessageType.FIND_NODE,
          senderId,
          messageId: 'test-1',
          timestamp: Date.now(),
          targetId: generateNodeId(),
        };

        routingTable.handleFindNode(request);

        const contact = routingTable.getContact(senderId);
        expect(contact).toBeDefined();
      });
    });

    describe('handleFindValue', () => {
      it('should return value if found', () => {
        const key = generateDHTKey('test-key');
        const value: DHTValue = {
          data: new Uint8Array([1, 2, 3]),
          storedAt: Date.now(),
          ttl: 3600000,
          publisherId: localNodeId,
        };
        routingTable.storeLocal(key, value);

        const request: FindValueRequest = {
          type: 'FIND_VALUE' as DHTMessageType.FIND_VALUE,
          senderId: generateNodeId(),
          messageId: 'test-1',
          timestamp: Date.now(),
          key,
        };

        const response = routingTable.handleFindValue(request);

        expect(response.type).toBe('FIND_VALUE_RESPONSE');
        expect((response as any).value.data).toEqual(value.data);
      });

      it('should return nodes if value not found', () => {
        // Add some contacts
        routingTable.addContact(createContact());

        const request: FindValueRequest = {
          type: 'FIND_VALUE' as DHTMessageType.FIND_VALUE,
          senderId: generateNodeId(),
          messageId: 'test-1',
          timestamp: Date.now(),
          key: generateDHTKey('non-existent'),
        };

        const response = routingTable.handleFindValue(request);

        expect(response.type).toBe('FIND_VALUE_NODES');
        expect((response as any).nodes).toBeDefined();
      });
    });

    describe('handleStore', () => {
      it('should store value and return success', () => {
        const key = generateDHTKey('test-key');
        const value: DHTValue = {
          data: new Uint8Array([1, 2, 3]),
          storedAt: Date.now(),
          ttl: 3600000,
          publisherId: generateNodeId(),
        };

        const request: StoreRequest = {
          type: 'STORE' as DHTMessageType.STORE,
          senderId: generateNodeId(),
          messageId: 'test-1',
          timestamp: Date.now(),
          key,
          value,
        };

        const response = routingTable.handleStore(request);

        expect(response.type).toBe('STORE_RESPONSE');
        expect(response.success).toBe(true);

        // Verify stored
        const stored = routingTable.getLocal(key);
        expect(stored).toBeDefined();
      });
    });

    describe('handlePing', () => {
      it('should return pong', () => {
        const request: PingRequest = {
          type: 'PING' as DHTMessageType.PING,
          senderId: generateNodeId(),
          messageId: 'test-1',
          timestamp: Date.now(),
        };

        const response = routingTable.handlePing(request);

        expect(response.type).toBe('PONG');
        expect(response.messageId).toBe('test-1');
      });
    });
  });

  describe('Statistics', () => {
    it('should return correct stats', () => {
      // Add contacts
      for (let i = 0; i < 5; i++) {
        routingTable.addContact(createContact());
      }

      // Store value
      const key = generateDHTKey('test');
      routingTable.storeLocal(key, {
        data: new Uint8Array([1]),
        storedAt: Date.now(),
        ttl: 3600000,
        publisherId: localNodeId,
      });

      const stats = routingTable.getStats();

      expect(stats.nodeCount).toBe(5);
      expect(stats.valueCount).toBe(1);
      expect(stats.activeBuckets).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('Clear', () => {
    it('should clear all data', () => {
      // Add data
      routingTable.addContact(createContact());
      routingTable.storeLocal(generateDHTKey('test'), {
        data: new Uint8Array([1]),
        storedAt: Date.now(),
        ttl: 3600000,
        publisherId: localNodeId,
      });

      routingTable.clear();

      const stats = routingTable.getStats();
      expect(stats.nodeCount).toBe(0);
      expect(stats.valueCount).toBe(0);
    });
  });

  describe('Bucket Distribution', () => {
    it('should return bucket distribution', () => {
      // Add contacts
      for (let i = 0; i < 10; i++) {
        routingTable.addContact(createContact());
      }

      const distribution = routingTable.getBucketDistribution();

      expect(distribution.length).toBe(160);
      expect(distribution.reduce((a, b) => a + b, 0)).toBe(10);
    });
  });
});
