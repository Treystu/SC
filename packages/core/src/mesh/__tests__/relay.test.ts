import { MessageRouter, PriorityQueue, BandwidthScheduler, decrementTTL } from '../relay';
import { RoutingTable } from '../routing';
import { DeduplicationCache } from '../deduplication';
import { Message, MessageType, TransportType } from '../../types';
import { generateIdentity } from '../../crypto';
import { createMessageHeader } from '../../protocol';

describe('Relay', () => {
  describe('decrementTTL', () => {
    it('should decrement TTL', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        5,
        identity.publicKey,
        identity.privateKey,
        10
      );
      const message: Message = { header, payload: new Uint8Array() };

      expect(decrementTTL(message)).toBe(true);
      expect(message.header.ttl).toBe(4);
    });

    it('should return false when TTL expires', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        0,
        identity.publicKey,
        identity.privateKey,
        10
      );
      const message: Message = { header, payload: new Uint8Array() };

      expect(decrementTTL(message)).toBe(false);
    });
  });

  describe('MessageRouter', () => {
    let router: MessageRouter;
    let routingTable: RoutingTable;
    let cache: DeduplicationCache;

    beforeEach(() => {
      routingTable = new RoutingTable();
      cache = new DeduplicationCache();
      router = new MessageRouter(routingTable, cache);
    });

    afterEach(() => {
      cache.destroy();
    });

    it('should relay new messages', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        5,
        identity.publicKey,
        identity.privateKey,
        10
      );
      const message: Message = { header, payload: new Uint8Array() };

      expect(router.shouldRelay(message)).toBe(true);
    });

    it('should not relay duplicate messages', () => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        MessageType.TEXT,
        5,
        identity.publicKey,
        identity.privateKey,
        10
      );
      const message: Message = { header, payload: new Uint8Array() };

      router.markSeen(message);
      expect(router.shouldRelay(message)).toBe(false);
    });

    it('should exclude sender from relay peers', () => {
      const sender = generateIdentity();
      const peer1 = generateIdentity();
      const peer2 = generateIdentity();

      routingTable.addPeer({
        id: peer1.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      });
      routingTable.addPeer({
        id: peer2.publicKey,
        lastSeen: Date.now(),
        connectionType: TransportType.WEBRTC,
        reliability: 1.0,
      });

      const header = createMessageHeader(
        MessageType.TEXT,
        5,
        sender.publicKey,
        sender.privateKey,
        10
      );
      const message: Message = { header, payload: new Uint8Array() };

      const relayPeers = router.getRelayPeers(message, peer1.publicKey);
      expect(relayPeers).toHaveLength(1);
      expect(relayPeers[0]).toEqual(peer2.publicKey);
    });
  });

  describe('PriorityQueue', () => {
    let queue: PriorityQueue;

    beforeEach(() => {
      queue = new PriorityQueue();
    });

    const createMessage = (type: MessageType): Message => {
      const identity = generateIdentity();
      const header = createMessageHeader(
        type,
        5,
        identity.publicKey,
        identity.privateKey,
        10
      );
      return { header, payload: new Uint8Array() };
    };

    it('should prioritize control messages', () => {
      const textMsg = createMessage(MessageType.TEXT);
      const controlMsg = createMessage(MessageType.CONTROL);

      queue.enqueue(textMsg);
      queue.enqueue(controlMsg);

      expect(queue.dequeue()).toEqual(controlMsg);
      expect(queue.dequeue()).toEqual(textMsg);
    });

    it('should maintain priority order', () => {
      const fileMsg = createMessage(MessageType.FILE);
      const textMsg = createMessage(MessageType.TEXT);
      const voiceMsg = createMessage(MessageType.VOICE);
      const controlMsg = createMessage(MessageType.CONTROL);

      queue.enqueue(fileMsg);
      queue.enqueue(textMsg);
      queue.enqueue(voiceMsg);
      queue.enqueue(controlMsg);

      expect(queue.dequeue()?.header.type).toBe(MessageType.CONTROL);
      expect(queue.dequeue()?.header.type).toBe(MessageType.VOICE);
      expect(queue.dequeue()?.header.type).toBe(MessageType.TEXT);
      expect(queue.dequeue()?.header.type).toBe(MessageType.FILE);
    });

    it('should track queue size', () => {
      expect(queue.size()).toBe(0);
      queue.enqueue(createMessage(MessageType.TEXT));
      expect(queue.size()).toBe(1);
      queue.enqueue(createMessage(MessageType.TEXT));
      expect(queue.size()).toBe(2);
      queue.dequeue();
      expect(queue.size()).toBe(1);
    });
  });

  describe('BandwidthScheduler', () => {
    let scheduler: BandwidthScheduler;

    beforeEach(() => {
      scheduler = new BandwidthScheduler(1000); // 1KB/s
    });

    it('should allow sending within bandwidth', () => {
      expect(scheduler.canSend(500)).toBe(true);
      scheduler.recordSent(500);
      expect(scheduler.canSend(500)).toBe(true);
    });

    it('should block sending when bandwidth exceeded', () => {
      scheduler.recordSent(800);
      expect(scheduler.canSend(300)).toBe(false);
    });

    it('should reset bandwidth window', (done) => {
      scheduler.recordSent(1000);
      expect(scheduler.canSend(100)).toBe(false);

      setTimeout(() => {
        expect(scheduler.canSend(100)).toBe(true);
        done();
      }, 1100);
    });
  });
});
