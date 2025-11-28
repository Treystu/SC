type Listener = (...args: any[]) => void;

export interface SignalingMessage {
    from: string;
    to: string;
    type: string;
    signal: any;
    timestamp: string;
}

export interface PublicMessage {
    from: string;
    content: string;
    timestamp: string;
}

export class HttpSignalingClient {
    private url: string;
    private peerId: string;
    private pollInterval: any;
    private isPolling: boolean = false;
    private listeners: Map<string, Listener[]> = new Map();

    constructor(url: string, peerId: string) {
        this.url = url;
        this.peerId = peerId;
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
            const response = await fetch(this.url, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'join',
                    peerId: this.peerId,
                    payload: { metadata }
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

    async sendSignal(to: string, type: string, signal: any) {
        await fetch(this.url, {
            method: 'POST',
            body: JSON.stringify({
                action: 'signal',
                peerId: this.peerId,
                payload: { to, type, signal }
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
                        this.emit('signal', s);
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
