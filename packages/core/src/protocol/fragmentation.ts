import { MessageFragment, MAX_FRAGMENT_SIZE } from '../types';
import { generateMessageId } from '../crypto';

/**
 * Task 19: Implement message fragmentation (for large messages)
 * Splits large data into fragments
 */
export function fragmentMessage(data: Uint8Array, maxFragmentSize: number = MAX_FRAGMENT_SIZE): MessageFragment[] {
  const messageId = generateMessageId();
  const totalFragments = Math.ceil(data.length / maxFragmentSize);
  const fragments: MessageFragment[] = [];

  for (let i = 0; i < totalFragments; i++) {
    const start = i * maxFragmentSize;
    const end = Math.min(start + maxFragmentSize, data.length);
    const fragmentData = data.slice(start, end);

    fragments.push({
      messageId,
      fragmentIndex: i,
      totalFragments,
      data: fragmentData,
    });
  }

  return fragments;
}

/**
 * Task 20: Create message reassembly logic
 * Manages fragment collection and reassembly
 */
export class FragmentAssembler {
  private fragments: Map<string, Map<number, MessageFragment>> = new Map();
  private timeouts: Map<string, number> = new Map();
  private readonly timeout: number = 60000; // 60 seconds

  /**
   * Adds a fragment and returns the complete message if all fragments received
   */
  addFragment(fragment: MessageFragment): Uint8Array | null {
    const messageIdStr = this.bufferToHex(fragment.messageId);

    // Initialize fragment map for this message if needed
    if (!this.fragments.has(messageIdStr)) {
      this.fragments.set(messageIdStr, new Map());
      
      // Set timeout to clean up incomplete messages
      const timeoutId = setTimeout(() => {
        this.fragments.delete(messageIdStr);
        this.timeouts.delete(messageIdStr);
      }, this.timeout);
      
      this.timeouts.set(messageIdStr, timeoutId as unknown as number);
    }

    const fragmentMap = this.fragments.get(messageIdStr)!;
    fragmentMap.set(fragment.fragmentIndex, fragment);

    // Check if we have all fragments
    if (fragmentMap.size === fragment.totalFragments) {
      return this.reassemble(messageIdStr);
    }

    return null;
  }

  /**
   * Reassembles fragments into original message
   */
  private reassemble(messageIdStr: string): Uint8Array {
    const fragmentMap = this.fragments.get(messageIdStr)!;
    const fragments = Array.from(fragmentMap.values()).sort(
      (a, b) => a.fragmentIndex - b.fragmentIndex
    );

    // Calculate total size
    const totalSize = fragments.reduce((sum, frag) => sum + frag.data.length, 0);
    const result = new Uint8Array(totalSize);

    // Copy fragments
    let offset = 0;
    for (const fragment of fragments) {
      result.set(fragment.data, offset);
      offset += fragment.data.length;
    }

    // Clean up
    this.fragments.delete(messageIdStr);
    const timeoutId = this.timeouts.get(messageIdStr);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      this.timeouts.delete(messageIdStr);
    }

    return result;
  }

  /**
   * Clears all fragments
   */
  clear(): void {
    for (const timeoutId of this.timeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.fragments.clear();
    this.timeouts.clear();
  }

  /**
   * Helper to convert buffer to hex string
   */
  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
