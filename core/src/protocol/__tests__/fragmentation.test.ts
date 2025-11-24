import { fragmentMessage, FragmentAssembler } from '../fragmentation';

describe('Fragmentation', () => {
  describe('fragmentMessage', () => {
    it('should split data into fragments', () => {
      const data = new Uint8Array(1000).fill(42);
      const fragments = fragmentMessage(data, 300);

      expect(fragments).toHaveLength(4);
      expect(fragments[0].fragmentIndex).toBe(0);
      expect(fragments[0].totalFragments).toBe(4);
      expect(fragments[3].fragmentIndex).toBe(3);
    });

    it('should handle data smaller than fragment size', () => {
      const data = new Uint8Array(100).fill(42);
      const fragments = fragmentMessage(data, 300);

      expect(fragments).toHaveLength(1);
      expect(fragments[0].fragmentIndex).toBe(0);
      expect(fragments[0].totalFragments).toBe(1);
      expect(fragments[0].data).toEqual(data);
    });

    it('should assign same message ID to all fragments', () => {
      const data = new Uint8Array(1000).fill(42);
      const fragments = fragmentMessage(data, 300);

      const messageId = fragments[0].messageId;
      for (const fragment of fragments) {
        expect(fragment.messageId).toEqual(messageId);
      }
    });
  });

  describe('FragmentAssembler', () => {
    it('should reassemble fragments in order', () => {
      const originalData = new Uint8Array(1000).fill(42);
      const fragments = fragmentMessage(originalData, 300);
      const assembler = new FragmentAssembler();

      let result: Uint8Array | null = null;
      for (const fragment of fragments) {
        result = assembler.addFragment(fragment);
      }

      expect(result).not.toBeNull();
      expect(result).toEqual(originalData);
    });

    it('should reassemble fragments out of order', () => {
      const originalData = new Uint8Array(1000).fill(42);
      const fragments = fragmentMessage(originalData, 300);
      const assembler = new FragmentAssembler();

      // Add fragments in reverse order
      let result: Uint8Array | null = null;
      for (let i = fragments.length - 1; i >= 0; i--) {
        result = assembler.addFragment(fragments[i]);
      }

      expect(result).not.toBeNull();
      expect(result).toEqual(originalData);
    });

    it('should handle multiple concurrent reassemblies', () => {
      const data1 = new Uint8Array(500).fill(1);
      const data2 = new Uint8Array(500).fill(2);
      const fragments1 = fragmentMessage(data1, 200);
      const fragments2 = fragmentMessage(data2, 200);
      const assembler = new FragmentAssembler();

      // Interleave fragments
      const result1 = assembler.addFragment(fragments1[0]);
      expect(result1).toBeNull();

      const result2 = assembler.addFragment(fragments2[0]);
      expect(result2).toBeNull();

      const result3 = assembler.addFragment(fragments1[1]);
      expect(result3).toBeNull();

      const result4 = assembler.addFragment(fragments2[1]);
      expect(result4).toBeNull();

      const final1 = assembler.addFragment(fragments1[2]);
      expect(final1).toEqual(data1);

      const final2 = assembler.addFragment(fragments2[2]);
      expect(final2).toEqual(data2);
    });
  });
});
