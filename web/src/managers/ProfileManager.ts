import { IdentityManager, generateFingerprint, publicKeyToBase64 } from '@sc/core';

export interface UserProfile {
  displayName: string;
  avatar?: string; // Base64 or URL
  bio?: string;
  status?: 'available' | 'busy' | 'away';
  publicKey: string; // Base64
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
}

export class ProfileManager {
  private static readonly STORAGE_KEY = 'user_profile';

  async getProfile(): Promise<UserProfile> {
    const stored = localStorage.getItem(ProfileManager.STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return this.createDefaultProfile();
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const current = await this.getProfile();
    const updated = {
      ...current,
      ...updates,
      updatedAt: Date.now()
    };

    // Validate
    if (updates.displayName && !this.isValidDisplayName(updates.displayName)) {
      throw new Error('Invalid display name');
    }

    localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(updated));
    return updated;
  }

  private async createDefaultProfile(): Promise<UserProfile> {
    const identityManager = new IdentityManager();
    const identity = await identityManager.loadIdentity();
    if (!identity) {
      await identityManager.generateIdentity();
    }
    const publicKeyBytes = await identityManager.getPublicKeyBytes();
    const publicKey = publicKeyToBase64(publicKeyBytes);
    const fingerprint = await generateFingerprint(publicKeyBytes);

    const profile: UserProfile = {
      displayName: 'User',
      publicKey,
      fingerprint,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  private isValidDisplayName(name: string): boolean {
    return name.length >= 1 && name.length <= 50 && /^[a-zA-Z0-9\s\-_]+$/.test(name);
  }
}