/**
 * Tests for Web Share API utility
 */

import { WebShareAPI } from '../webShareAPI';
import type { PendingInvite } from '@sc/core';

// Mock navigator.share and navigator.clipboard
const mockShare = jest.fn();
const mockCanShare = jest.fn();
const mockWriteText = jest.fn();

const originalNavigator = global.navigator;

beforeEach(() => {
  // Reset mocks
  mockShare.mockReset();
  mockCanShare.mockReset();
  mockWriteText.mockReset();

  // Mock navigator
  Object.defineProperty(global, 'navigator', {
    value: {
      share: mockShare,
      canShare: mockCanShare,
      clipboard: {
        writeText: mockWriteText,
      },
    },
    writable: true,
    configurable: true,
  });

  // Mock window.location
  Object.defineProperty(window, 'location', {
    value: {
      origin: 'https://example.com',
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  // Restore navigator
  Object.defineProperty(global, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
});

describe('WebShareAPI', () => {
  const mockInvite: PendingInvite = {
    code: 'test-invite-code-123',
    inviterPeerId: 'peer-123',
    inviterPublicKey: new Uint8Array(32),
    inviterName: 'Test User',
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    signature: new Uint8Array(64),
    bootstrapPeers: [],
  };

  describe('share', () => {
    it('should use Web Share API when available', async () => {
      mockCanShare.mockReturnValue(true);
      mockShare.mockResolvedValue(undefined);

      const api = new WebShareAPI();
      const result = await api.share(mockInvite);

      expect(result.method).toBe('native');
      expect(result.success).toBe(true);
      expect(mockShare).toHaveBeenCalledWith({
        title: 'Join me on Sovereign Communications',
        text: 'Test User invited you to secure messaging',
        url: 'https://example.com/join#test-invite-code-123',
      });
    });

    it('should handle user cancellation gracefully', async () => {
      mockCanShare.mockReturnValue(true);
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      mockShare.mockRejectedValue(abortError);

      const api = new WebShareAPI();
      const result = await api.share(mockInvite);

      expect(result.method).toBe('native');
      expect(result.success).toBe(false);
    });

    it('should fallback to clipboard when Web Share API fails', async () => {
      mockCanShare.mockReturnValue(true);
      mockShare.mockRejectedValue(new Error('Share failed'));
      mockWriteText.mockResolvedValue(undefined);

      const api = new WebShareAPI();
      const result = await api.share(mockInvite);

      expect(result.method).toBe('clipboard');
      expect(result.success).toBe(true);
      expect(mockWriteText).toHaveBeenCalledWith(
        'https://example.com/join#test-invite-code-123'
      );
    });

    it('should use clipboard when Web Share API is not available', async () => {
      mockCanShare.mockReturnValue(false);
      mockWriteText.mockResolvedValue(undefined);

      const api = new WebShareAPI();
      const result = await api.share(mockInvite);

      expect(result.method).toBe('clipboard');
      expect(result.success).toBe(true);
      expect(mockShare).not.toHaveBeenCalled();
      expect(mockWriteText).toHaveBeenCalled();
    });

    it('should handle clipboard failure', async () => {
      mockCanShare.mockReturnValue(false);
      mockWriteText.mockRejectedValue(new Error('Clipboard failed'));

      const api = new WebShareAPI();
      const result = await api.share(mockInvite);

      expect(result.method).toBe('clipboard');
      expect(result.success).toBe(false);
    });

    it('should use inviter name in share text', async () => {
      mockCanShare.mockReturnValue(true);
      mockShare.mockResolvedValue(undefined);

      const inviteWithName = { ...mockInvite, inviterName: 'Alice' };
      const api = new WebShareAPI();
      await api.share(inviteWithName);

      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Alice invited you to secure messaging',
        })
      );
    });

    it('should use fallback text when inviter name is missing', async () => {
      mockCanShare.mockReturnValue(true);
      mockShare.mockResolvedValue(undefined);

      const inviteWithoutName = { ...mockInvite, inviterName: undefined };
      const api = new WebShareAPI();
      await api.share(inviteWithoutName);

      expect(mockShare).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'A friend invited you to secure messaging',
        })
      );
    });
  });

  describe('isAvailable', () => {
    it('should return true when Web Share API is available', () => {
      expect(WebShareAPI.isAvailable()).toBe(true);
    });

    it('should return false when Web Share API is not available', () => {
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(WebShareAPI.isAvailable()).toBe(false);
    });
  });
});
