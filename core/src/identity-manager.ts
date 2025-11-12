// Identity and keypair management
export interface Identity {
  id: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  created: Date;
  displayName?: string;
}

export interface IdentityExport {
  id: string;
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  created: string;
  displayName?: string;
}

export class IdentityManager {
  private identity: Identity | null = null;

  // Generate new identity
  async generateIdentity(displayName?: string): Promise<Identity> {
    // Generate Ed25519 keypair for signing
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519'
      } as any,
      true,
      ['sign', 'verify']
    );

    // Generate unique ID from public key
    const publicKeyExport = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyHash = await crypto.subtle.digest('SHA-256', publicKeyExport);
    const id = this.arrayBufferToHex(publicKeyHash).substring(0, 16);

    this.identity = {
      id,
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      created: new Date(),
      displayName
    };

    await this.saveIdentity();
    return this.identity;
  }

  // Load existing identity from storage
  async loadIdentity(): Promise<Identity | null> {
    try {
      const stored = localStorage.getItem('sovereign-identity');
      if (!stored) return null;

      const data: IdentityExport = JSON.parse(stored);

      // Import keys
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        data.publicKeyJwk,
        { name: 'Ed25519', namedCurve: 'Ed25519' } as any,
        true,
        ['verify']
      );

      const privateKey = await crypto.subtle.importKey(
        'jwk',
        data.privateKeyJwk,
        { name: 'Ed25519', namedCurve: 'Ed25519' } as any,
        true,
        ['sign']
      );

      this.identity = {
        id: data.id,
        publicKey,
        privateKey,
        created: new Date(data.created),
        displayName: data.displayName
      };

      return this.identity;
    } catch (error) {
      console.error('Failed to load identity:', error);
      return null;
    }
  }

  // Save identity to storage
  private async saveIdentity(): Promise<void> {
    if (!this.identity) return;

    const exported = await this.exportIdentity();
    localStorage.setItem('sovereign-identity', JSON.stringify(exported));
  }

  // Export identity (for backup)
  async exportIdentity(): Promise<IdentityExport> {
    if (!this.identity) throw new Error('No identity to export');

    const publicKeyJwk = await crypto.subtle.exportKey('jwk', this.identity.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', this.identity.privateKey);

    return {
      id: this.identity.id,
      publicKeyJwk,
      privateKeyJwk,
      created: this.identity.created.toISOString(),
      displayName: this.identity.displayName
    };
  }

  // Import identity (from backup)
  async importIdentity(data: IdentityExport): Promise<Identity> {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      data.publicKeyJwk,
      { name: 'Ed25519', namedCurve: 'Ed25519' } as any,
      true,
      ['verify']
    );

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      data.privateKeyJwk,
      { name: 'Ed25519', namedCurve: 'Ed25519' } as any,
      true,
      ['sign']
    );

    this.identity = {
      id: data.id,
      publicKey,
      privateKey,
      created: new Date(data.created),
      displayName: data.displayName
    };

    await this.saveIdentity();
    return this.identity;
  }

  // Get current identity
  getIdentity(): Identity | null {
    return this.identity;
  }

  // Sign data
  async sign(data: Uint8Array): Promise<Uint8Array> {
    if (!this.identity) throw new Error('No identity loaded');

    const signature = await crypto.subtle.sign(
      { name: 'Ed25519' } as any,
      this.identity.privateKey,
      data
    );

    return new Uint8Array(signature);
  }

  // Verify signature
  async verify(data: Uint8Array, signature: Uint8Array, publicKey: CryptoKey): Promise<boolean> {
    try {
      return await crypto.subtle.verify(
        { name: 'Ed25519' } as any,
        publicKey,
        signature,
        data
      );
    } catch {
      return false;
    }
  }

  // Get public key as string
  async getPublicKeyString(): Promise<string> {
    if (!this.identity) throw new Error('No identity loaded');

    const exported = await crypto.subtle.exportKey('raw', this.identity.publicKey);
    return this.arrayBufferToHex(exported);
  }

  // Delete identity
  async deleteIdentity(): Promise<void> {
    localStorage.removeItem('sovereign-identity');
    this.identity = null;
  }

  // Helper: ArrayBuffer to hex string
  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
