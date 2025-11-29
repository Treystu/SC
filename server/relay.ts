import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import express from 'express';
import path from 'path';

// Simple in-memory directory for the relay
interface PeerEntry {
    id: string;
    signalingRoutes: string[];
    lastSeen: number;
    socket?: WebSocket;
}

const PORT = process.env.PORT || 8080;
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files from the React app build directory
const clientBuildPath = path.join(__dirname, '../../web/dist');
app.use(express.static(clientBuildPath));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

const peers = new Map<string, PeerEntry>();

console.log(`Relay Server starting on port ${PORT}...`);

wss.on('connection', (ws) => {
    let peerId: string | null = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
                case 'register':
                    peerId = data.peerId;
                    if (peerId) {
                        console.log(`Peer registered: ${peerId}`);
                        peers.set(peerId, {
                            id: peerId,
                            signalingRoutes: data.entry.signalingRoutes,
                            lastSeen: Date.now(),
                            socket: ws
                        });

                        // Broadcast this new peer to everyone (Gossip)
                        const update = {
                            type: 'directory_update',
                            entries: [data.entry]
                        };
                        broadcast(JSON.stringify(update), peerId);
                    }
                    break;

                case 'get_directory':
                    // Send current directory to the requester
                    const entries = Array.from(peers.values()).map(p => ({
                        id: p.id,
                        signalingRoutes: p.signalingRoutes,
                        lastSeen: p.lastSeen
                    }));
                    ws.send(JSON.stringify({
                        type: 'directory_update',
                        entries
                    }));
                    break;

                case 'signal':
                    // Relay signal to target peer
                    const targetId = data.to;
                    const target = peers.get(targetId);
                    if (target && target.socket && target.socket.readyState === WebSocket.OPEN) {
                        target.socket.send(JSON.stringify({
                            type: 'signal',
                            from: data.from,
                            signalType: data.signalType,
                            signal: data.signal
                        }));
                    } else {
                        console.warn(`Target peer ${targetId} not found or disconnected`);
                    }
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        if (peerId) {
            console.log(`Peer disconnected: ${peerId}`);
            peers.delete(peerId);
            // Optional: Broadcast disconnection? 
            // For now, we rely on "lastSeen" or connection failure to prune.
        }
    });
});

function broadcast(data: string, excludeId?: string) {
    peers.forEach((peer) => {
        if (peer.id !== excludeId && peer.socket && peer.socket.readyState === WebSocket.OPEN) {
            peer.socket.send(data);
        }
    });
}

server.listen(PORT, () => {
    console.log(`Relay Server listening on port ${PORT}`);
    console.log(`Serving static files from ${clientBuildPath}`);
});
