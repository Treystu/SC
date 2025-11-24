import { DeduplicationCache } from '../deduplication';
import { Message, MessageType } from '../../types';
import { generateIdentity } from '../../crypto';
import { createMessageHeader } from '../../protocol';

describe('DeduplicationCache', () => {
  let cache: DeduplicationCache;

  beforeEach(() => {
    cache = new DeduplicationCache(5000, 100);
  });

  afterEach(() => {
    cache.destroy();
  });

  const createTestMessage = (): Message => {
    const identity = generateIdentity();
    const header = createMessageHeader(
      MessageType.TEXT,
      16,
      identity.publicKey,
      identity.privateKey,
      10
    );
    return {
      header,
      payload: new Uint8Array([1, 2, 3]),
    };
  };

  it('should detect duplicate messages', () => {
    const message = createTestMessage();

    expect(cache.hasSeen(message)).toBe(false);
    cache.markSeen(message);
    expect(cache.hasSeen(message)).toBe(true);
  });

  it('should distinguish different messages', () => {
    const message1 = createTestMessage();
    const message2 = createTestMessage();

    cache.markSeen(message1);
    expect(cache.hasSeen(message1)).toBe(true);
    expect(cache.hasSeen(message2)).toBe(false);
  });

  it('should handle many messages', () => {
    const messages: Message[] = [];
    for (let i = 0; i < 50; i++) {
      messages.push(createTestMessage());
    }

    messages.forEach(msg => cache.markSeen(msg));
    messages.forEach(msg => {
      expect(cache.hasSeen(msg)).toBe(true);
    });
  });
});
