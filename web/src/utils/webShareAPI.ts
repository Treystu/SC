/**
 * Web Share API utility for sharing invite links
 * Provides fallback to clipboard when Web Share API is not available
 */

import type { PendingInvite } from '@sc/core';

interface ShareData {
  title: string;
  text: string;
  url: string;
}

export class WebShareAPI {
  /**
   * Build a shareable URL from an invite
   */
  private buildShareUrl(invite: PendingInvite): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/join#${invite.code}`;
  }

  /**
   * Share an invite using the Web Share API or clipboard fallback
   */
  async share(invite: PendingInvite): Promise<{ method: 'native' | 'clipboard'; success: boolean }> {
    const url = this.buildShareUrl(invite);
    const shareData: ShareData = {
      title: 'Join me on Sovereign Communications',
      text: `${invite.inviterName || 'A friend'} invited you to secure messaging`,
      url,
    };

    // Try native Web Share API first
    if (navigator.share && this.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return { method: 'native', success: true };
      } catch (error) {
        // User cancelled or error occurred
        if (error instanceof Error && error.name === 'AbortError') {
          // User cancelled, not a real error
          return { method: 'native', success: false };
        }
        // Fall through to clipboard
        console.warn('Web Share API failed, falling back to clipboard:', error);
      }
    }

    // Fallback to clipboard
    try {
      await this.copyToClipboard(url);
      return { method: 'clipboard', success: true };
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return { method: 'clipboard', success: false };
    }
  }

  /**
   * Check if the Web Share API can share the given data
   */
  private canShare(data: ShareData): boolean {
    if (!navigator.canShare) {
      return false;
    }
    try {
      return navigator.canShare(data);
    } catch {
      return false;
    }
  }

  /**
   * Copy text to clipboard
   */
  private async copyToClipboard(text: string): Promise<void> {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }
  }

  /**
   * Check if Web Share API is available
   */
  static isAvailable(): boolean {
    return 'share' in navigator;
  }
}
