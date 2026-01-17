/**
 * QRSignaling - QR code-based connection exchange for offline bootstrap
 *
 * Enables connection establishment without any network:
 * 1. User A generates QR code with identity + optional SDP offer
 * 2. User B scans QR code and extracts connection info
 * 3. If offer included, B creates answer and shows their QR
 * 4. A scans B's QR to complete handshake
 *
 * For apocalypse scenarios where no DHT/internet is available.
 */

/**
 * Version of the QR payload format
 */
export const QR_PAYLOAD_VERSION = 1;

/**
 * QR code payload for identity exchange
 */
export interface QRIdentityPayload {
  /** Payload format version */
  v: number;

  /** Peer ID (16-char hex fingerprint) */
  id: string;

  /** Ed25519 public key (base64) */
  pk: string;

  /** Display name */
  name: string;

  /** Optional: SDP offer for immediate connection */
  offer?: string;

  /** Optional: ICE candidates (compressed) */
  ice?: string[];

  /** Optional: Known DHT bootstrap nodes */
  nodes?: string[];

  /** Timestamp when QR was generated */
  ts: number;

  /** Geographic zone hint (optional) */
  geo?: string;

  /** Signature over the payload */
  sig: string;
}

/**
 * Parsed QR payload with decoded fields
 */
export interface ParsedQRPayload {
  version: number;
  peerId: string;
  publicKey: Uint8Array;
  displayName: string;
  offer?: RTCSessionDescriptionInit;
  iceCandidates: RTCIceCandidateInit[];
  bootstrapNodes: string[];
  timestamp: number;
  geoZone?: string;
  signature: Uint8Array;
}

/**
 * Result of processing a scanned QR code
 */
export interface QRProcessResult {
  success: boolean;
  payload?: ParsedQRPayload;
  error?: string;
  needsAnswer: boolean;
}

/**
 * QR Signaling Manager
 */
export class QRSignaling {
  private localPeerId: string;
  private localPublicKey: Uint8Array;
  private displayName: string;
  private signFunc: (data: Uint8Array) => Promise<Uint8Array>;
  private verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>;

  constructor(
    localPeerId: string,
    localPublicKey: Uint8Array,
    displayName: string,
    signFunc: (data: Uint8Array) => Promise<Uint8Array>,
    verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>
  ) {
    this.localPeerId = localPeerId;
    this.localPublicKey = localPublicKey;
    this.displayName = displayName;
    this.signFunc = signFunc;
    this.verifyFunc = verifyFunc;
  }

  /**
   * Generate a QR payload for identity exchange
   */
  async generateIdentityPayload(options: {
    offer?: RTCSessionDescriptionInit;
    iceCandidates?: RTCIceCandidateInit[];
    bootstrapNodes?: string[];
    geoZone?: string;
  } = {}): Promise<QRIdentityPayload> {
    const payload: Omit<QRIdentityPayload, 'sig'> = {
      v: QR_PAYLOAD_VERSION,
      id: this.localPeerId,
      pk: this.encodeBase64(this.localPublicKey),
      name: this.displayName,
      ts: Date.now(),
    };

    // Add optional fields
    if (options.offer) {
      payload.offer = JSON.stringify(options.offer);
    }

    if (options.iceCandidates && options.iceCandidates.length > 0) {
      payload.ice = options.iceCandidates.map(c => JSON.stringify(c));
    }

    if (options.bootstrapNodes && options.bootstrapNodes.length > 0) {
      payload.nodes = options.bootstrapNodes;
    }

    if (options.geoZone) {
      payload.geo = options.geoZone;
    }

    // Sign the payload
    const dataToSign = this.getSigningData(payload);
    const signature = await this.signFunc(dataToSign);

    return {
      ...payload,
      sig: this.encodeBase64(signature),
    };
  }

  /**
   * Encode payload as compact string for QR code
   * Uses JSON with short keys to minimize QR size
   */
  encodeForQR(payload: QRIdentityPayload): string {
    return JSON.stringify(payload);
  }

  /**
   * Decode QR string back to payload
   */
  decodeFromQR(data: string): QRIdentityPayload | null {
    try {
      const payload = JSON.parse(data) as QRIdentityPayload;

      // Basic validation
      if (!payload.v || !payload.id || !payload.pk || !payload.sig) {
        console.error('[QRSignaling] Invalid payload structure');
        return null;
      }

      return payload;
    } catch (err) {
      console.error('[QRSignaling] Failed to parse QR data:', err);
      return null;
    }
  }

  /**
   * Parse and validate a QR payload
   */
  parsePayload(payload: QRIdentityPayload): ParsedQRPayload {
    const publicKey = this.decodeBase64(payload.pk);
    const signature = this.decodeBase64(payload.sig);

    let offer: RTCSessionDescriptionInit | undefined;
    if (payload.offer) {
      try {
        offer = JSON.parse(payload.offer);
      } catch (err) {
        console.warn('[QRSignaling] Failed to parse offer:', err);
      }
    }

    const iceCandidates: RTCIceCandidateInit[] = [];
    if (payload.ice) {
      for (const iceStr of payload.ice) {
        try {
          iceCandidates.push(JSON.parse(iceStr));
        } catch (err) {
          console.warn('[QRSignaling] Failed to parse ICE candidate:', err);
        }
      }
    }

    return {
      version: payload.v,
      peerId: payload.id,
      publicKey,
      displayName: payload.name,
      offer,
      iceCandidates,
      bootstrapNodes: payload.nodes ?? [],
      timestamp: payload.ts,
      geoZone: payload.geo,
      signature,
    };
  }

  /**
   * Verify a QR payload signature
   */
  async verifyPayload(payload: QRIdentityPayload): Promise<boolean> {
    try {
      const publicKey = this.decodeBase64(payload.pk);
      const signature = this.decodeBase64(payload.sig);

      // Create payload without signature for verification
      const payloadWithoutSig: Omit<QRIdentityPayload, 'sig'> = { ...payload };
      delete (payloadWithoutSig as Record<string, unknown>).sig;

      const dataToSign = this.getSigningData(payloadWithoutSig);
      return await this.verifyFunc(dataToSign, signature, publicKey);
    } catch (err) {
      console.error('[QRSignaling] Verification error:', err);
      return false;
    }
  }

  /**
   * Process a scanned QR code
   */
  async processScannedQR(data: string): Promise<QRProcessResult> {
    // Parse QR data
    const payload = this.decodeFromQR(data);
    if (!payload) {
      return {
        success: false,
        error: 'Invalid QR code format',
        needsAnswer: false,
      };
    }

    // Check version compatibility
    if (payload.v > QR_PAYLOAD_VERSION) {
      return {
        success: false,
        error: `Unsupported QR version: ${payload.v}`,
        needsAnswer: false,
      };
    }

    // Verify signature
    const isValid = await this.verifyPayload(payload);
    if (!isValid) {
      return {
        success: false,
        error: 'Invalid signature - QR may be tampered',
        needsAnswer: false,
      };
    }

    // Check if too old (24 hours max)
    const age = Date.now() - payload.ts;
    if (age > 24 * 60 * 60 * 1000) {
      return {
        success: false,
        error: 'QR code expired (older than 24 hours)',
        needsAnswer: false,
      };
    }

    // Parse the payload
    const parsed = this.parsePayload(payload);

    return {
      success: true,
      payload: parsed,
      needsAnswer: !!parsed.offer,
    };
  }

  /**
   * Generate answer payload in response to an offer
   */
  async generateAnswerPayload(
    answer: RTCSessionDescriptionInit,
    iceCandidates: RTCIceCandidateInit[],
    geoZone?: string
  ): Promise<QRIdentityPayload> {
    return this.generateIdentityPayload({
      offer: answer, // Reuse the offer field for answer
      iceCandidates,
      geoZone,
    });
  }

  // ============== Private Methods ==============

  private getSigningData(payload: Omit<QRIdentityPayload, 'sig'>): Uint8Array {
    // Deterministic serialization for signing
    const str = JSON.stringify(payload, Object.keys(payload).sort());
    return new TextEncoder().encode(str);
  }

  private encodeBase64(data: Uint8Array): string {
    // Use URL-safe base64 to avoid issues in QR codes
    if (typeof btoa !== 'undefined') {
      // Browser
      return btoa(String.fromCharCode(...data))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    } else {
      // Node.js
      return Buffer.from(data)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    }
  }

  private decodeBase64(str: string): Uint8Array {
    // Restore standard base64
    const base64 = str
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Add padding if needed
    const padding = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padding);

    if (typeof atob !== 'undefined') {
      // Browser
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } else {
      // Node.js
      return new Uint8Array(Buffer.from(padded, 'base64'));
    }
  }
}

/**
 * Create a QR signaling instance
 */
export function createQRSignaling(
  localPeerId: string,
  localPublicKey: Uint8Array,
  displayName: string,
  signFunc: (data: Uint8Array) => Promise<Uint8Array>,
  verifyFunc: (data: Uint8Array, sig: Uint8Array, pubKey: Uint8Array) => Promise<boolean>
): QRSignaling {
  return new QRSignaling(localPeerId, localPublicKey, displayName, signFunc, verifyFunc);
}

/**
 * Estimate QR code data size
 */
export function estimateQRSize(payload: QRIdentityPayload): number {
  return JSON.stringify(payload).length;
}

/**
 * Check if payload fits in a standard QR code
 * Standard QR codes can hold ~2953 bytes in binary mode
 */
export function fitsInQR(payload: QRIdentityPayload): boolean {
  return estimateQRSize(payload) < 2900;
}
