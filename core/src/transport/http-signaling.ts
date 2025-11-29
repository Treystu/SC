import {
    IdentityKeyPair,
    generateEphemeralKeyPair,
    performKeyExchange,
    deriveSessionKey,
    encryptMessage,
    decryptMessage,
    randomBytes
} from '../crypto/primitives.js';

type Listener = (...args: any[]) => void;

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
    if (!hex) return new Uint8Array(0);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

export interface SignalingMessage {
    from: string;
    to: string;
    type: string;
    signal: any;
    timestamp: string;
    senderPublicKey?: string;
}

export interface PublicMessage {
    from: string;
    content: string;
    timestamp: string;
}

export class HttpSignalingClient {
    private url: string;
    private peerId: string;
    private identity?: IdentityKeyPair;
    private pollInterval: any;
    private isPolling: boolean = false;
    private listeners: Map<string, Listener[]> = new Map();

    constructor(url: string, peerId: string, identity?: IdentityKeyPair) {
        this.url = url;
        this.peerId = peerId;
        this.identity = identity;
    }

    on(event: string, listener: Listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);
    }

    emit(event: string, ...args: any[]) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(...args));
        }
    }

    async join(metadata: any = {}) {
        try {
            // Include public key in metadata if identity is available
            const finalMetadata = { ...metadata };
            if (this.identity) {
                finalMetadata.publicKey = toHex(this.identity.publicKey);
            }

            const response = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'join',
                    peerId: this.peerId,
                    payload: { metadata: finalMetadata }
                })
            });
            const data = await response.json();

            if (data.peers) {
                data.peers.forEach((p: any) => {
                    this.emit('peerDiscovered', p);
                });
            }

            this.startPolling();
        } catch (error) {
            console.error('Failed to join room:', error);
            throw error;
        }
    }

    async sendSignal(to: string, type: string, signal: any, recipientPublicKey?: Uint8Array) {
        let payloadSignal = signal;

        // Encrypt if recipient public key and identity are available
        if (recipientPublicKey && this.identity) {
            try {
                // 1. Generate ephemeral keypair
                const ephemeralKeyPair = generateEphemeralKeyPair();

                // 2. Perform ECDH: Ephemeral Private + Recipient Public
                const sharedSecret = performKeyExchange(
                    ephemeralKeyPair.privateKey,
                    recipientPublicKey
                );

                // 3. Derive session key
                const sessionKey = deriveSessionKey(sharedSecret, new Uint8Array(0), new TextEncoder().encode('signaling'));

                // 4. Encrypt signal
                const signalJson = JSON.stringify(signal);
                const signalBytes = new TextEncoder().encode(signalJson);
                const nonce = randomBytes(24);
                const ciphertext = encryptMessage(signalBytes, sessionKey, nonce);

                // 5. Construct encrypted payload
                payloadSignal = {
                    encrypted: true,
                    ephemeralPublicKey: toHex(ephemeralKeyPair.publicKey),
                    nonce: toHex(nonce),
                    ciphertext: toHex(ciphertext),
                    senderPublicKey: toHex(this.identity.publicKey)
                };
            } catch (error) {
                console.error('Failed to encrypt signal:', error);
                throw new Error('Failed to encrypt signal');
            }
        } else if (this.identity) {
            // Enforce encryption if we have an identity but missing recipient key
            // This prevents accidental plaintext signaling in secure contexts
            console.warn(`Sending unencrypted signal to ${to} because recipient public key is missing.`);
            // In strict mode, we might want to throw here:
            // throw new Error('Cannot send encrypted signal: missing recipient public key');
        }

        await fetch(this.url, {
            method: 'POST',
            body: JSON.stringify({
                action: 'signal',
                peerId: this.peerId,
                payload: { to, type, signal: payloadSignal }
            })
        });
    }

    async sendPublicMessage(content: string) {
        await fetch(this.url, {
            method: 'POST',
            body: JSON.stringify({
                action: 'message',
                peerId: this.peerId,
                payload: { content }
            })
        });
    }

    private startPolling() {
        if (this.isPolling) return;
        this.isPolling = true;

        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(this.url, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'poll',
                        peerId: this.peerId
                    })
                });
                const data = await response.json();

                if (data.signals) {
                    data.signals.forEach((s: SignalingMessage) => {
                        // Try to decrypt if encrypted
                        if (s.signal && s.signal.encrypted && this.identity) {
                            try {
                                const { ephemeralPublicKey, nonce, ciphertext, senderPublicKey } = s.signal;

                                // 1. Perform ECDH: Identity Private + Ephemeral Public
                                const sharedSecret = performKeyExchange(
                                    this.identity.privateKey,
                                    fromHex(ephemeralPublicKey)
                                );

                                // 2. Derive session key
                                const sessionKey = deriveSessionKey(sharedSecret, new Uint8Array(0), new TextEncoder().encode('signaling'));

                                // 3. Decrypt
                                const plaintextBytes = decryptMessage(
                                    fromHex(ciphertext),
                                    sessionKey,
                                    fromHex(nonce)
                                );

                                const plaintext = new TextDecoder().decode(plaintextBytes);
                                s.signal = JSON.parse(plaintext);

                                // Attach sender public key to the decrypted signal object so listeners can use it
                                if (senderPublicKey) {
                                    s.signal.senderPublicKey = senderPublicKey;
                                }
                            } catch (error) {
                                console.error('Failed to decrypt signal:', error);
                                return;
                            }
                        }
                        this.emit('signal', s);
                    });
                }

                if (data.peers) {
                    data.peers.forEach((p: any) => {
                        this.emit('peerDiscovered', p);
                    });
                }

                if (data.messages) {
                    data.messages.forEach((m: PublicMessage) => {
                        this.emit('publicMessage', m);
                    });
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    stop() {
        this.isPolling = false;
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
        }
    }
}
