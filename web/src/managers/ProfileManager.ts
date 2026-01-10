import { IdentityManager, generateFingerprint, publicKeyToBase64 } from '@sc/core';
import { getDatabase } from '../storage/database';

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
    console.log('[ProfileManager] getProfile called');
    
    // First, try to get displayName from IndexedDB identity (source of truth)
    try {
      const db = getDatabase();
      const identity = await db.getPrimaryIdentity();
      console.log('[ProfileManager] Identity from DB:', {
        hasIdentity: !!identity,
        displayName: identity?.displayName,
        fingerprint: identity?.fingerprint?.substring(0, 8)
      });
      
      if (identity && identity.displayName) {
        // Build profile from identity
        const publicKey = identity.publicKey 
          ? Array.from(identity.publicKey).map(b => b.toString(16).padStart(2, '0')).join('')
          : '';
        
        const profile: UserProfile = {
          displayName: identity.displayName,
          publicKey,
          fingerprint: identity.fingerprint || '',
          createdAt: identity.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        
        // Sync to localStorage for consistency
        localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(profile));
        console.log('[ProfileManager] Returning profile from identity:', profile.displayName);
        return profile;
      }
    } catch (error) {
      console.error('[ProfileManager] Error loading identity from DB:', error);
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(ProfileManager.STORAGE_KEY);
    if (stored) {
      console.log('[ProfileManager] Returning profile from localStorage');
      return JSON.parse(stored);
    }
    
    console.log('[ProfileManager] Creating default profile');
    return this.createDefaultProfile();
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    console.log('[ProfileManager] updateProfile called with:', updates);
    
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

    // Save to localStorage
    localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(updated));
    
    // Also update the identity in IndexedDB
    if (updates.displayName) {
      try {
        const db = getDatabase();
        const identity = await db.getPrimaryIdentity();
        if (identity) {
          console.log('[ProfileManager] Updating identity displayName in DB');
          await db.saveIdentity({
            ...identity,
            displayName: updates.displayName
          });
        }
      } catch (error) {
        console.error('[ProfileManager] Error updating identity in DB:', error);
      }
    }
    
    console.log('[ProfileManager] Profile updated:', updated.displayName);
    return updated;
  }

  private async createDefaultProfile(): Promise<UserProfile> {
    console.log('[ProfileManager] createDefaultProfile called');
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
    console.log('[ProfileManager] Default profile created');
    return profile;
  }

  private isValidDisplayName(name: string): boolean {
    return name.length >= 1 && name.length <= 50 && /^[a-zA-Z0-9\s\-_]+$/.test(name);
  }
}