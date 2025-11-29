import { Directory, PeerEntry } from '../mesh/directory.js';

type Listener = (...args: any[]) => void;

export class WebSocketSignalingClient {
    private ws: WebSocket | null = null;
    private url: string;
    private peerId: string;
    private directory: Directory;
    private listeners: Map<string, Listener[]> = new Map();
    private reconnectTimer: any;
    private isClosed: boolean = false;

    constructor(url: string, peerId: string, directory: Directory) {
        this.url = url;
        this.peerId = peerId;
        this.directory = directory;
    }

    connect() {
        if (this.isClosed) return;

        console.log(`Connecting to relay: ${this.url}`);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('Connected to relay');
            this.emit('open');

            // Register with the relay
            this.send({
                type: 'register',
                peerId: this.peerId,
                entry: {
                    id: this.peerId,
                    signalingRoutes: [this.url], // Advertise this relay as a route to me
                    lastSeen: Date.now()
                }
            });

            // Request directory
            this.send({ type: 'get_directory' });
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from relay');
            this.emit('close');
            this.ws = null;

            if (!this.isClosed) {
                this.reconnectTimer = setTimeout(() => this.connect(), 5000);
            }
        };

        this.ws.onerror = (err) => {
            console.error('WebSocket error:', err);
        };
    }

    private handleMessage(msg: any) {
        switch (msg.type) {
            case 'directory_update':
                if (msg.entries) {
                    this.directory.merge(msg.entries);
                    this.emit('directoryUpdated', msg.entries);
                }
                break;

            case 'signal':
                this.emit('signal', {
                    from: msg.from,
                    type: msg.signalType,
                    signal: msg.signal
                });
                break;

            case 'error':
                console.error('Relay error:', msg.message);
                break;
        }
    }

    sendSignal(to: string, type: string, signal: any) {
        this.send({
            type: 'signal',
            to,
            from: this.peerId,
            signalType: type,
            signal
        });
    }

    private send(data: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('Cannot send, WebSocket not open');
        }
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
            listeners.forEach(l => l(...args));
        }
    }

    close() {
        this.isClosed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws) this.ws.close();
    }
}
