//
//  MeshNetworkManager.swift
//  SovereignCommunications
//
//  Created by Your Name on 2023-10-27.
//

import Foundation
import CoreData
import CoreBluetooth
import os.log
import WebRTC

struct Message: Codable {
    let id: UUID
    let timestamp: Date
    let payload: String
}

struct NetworkStats {
    var connectedPeers: Int
    var messagesSent: Int
    var messagesReceived: Int
    var bandwidth: (upload: Double, download: Double)
    var latency: (average: Double, min: Double, max: Double)
    var packetLoss: Double
    var uptime: TimeInterval
    var bleConnections: Int
    var webrtcConnections: Int
    var error: String?
}

/**
 * Manages the mesh network, including peer connections, message routing, and data persistence.
 * Acts as the high-level coordinator, using BluetoothMeshManager and WebRTCManager as transport drivers.
 * 
 * Unified with @sc/core architecture:
 * - Uses IOSPersistenceAdapter for message queue persistence
 * - Consistent with Web and Android implementations
 * - Binary-safe message handling
 */
class MeshNetworkManager: NSObject, ObservableObject {
    
    static let shared = MeshNetworkManager()
    
    private let context: NSManagedObjectContext
    private let startTime: Date
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "MeshNetworkManager")
    
    // Unified persistence adapter (matches Web/Android)
    private let persistenceAdapter: IOSPersistenceAdapter
    
    @Published var connectedPeers: [String] = [] // List of connected Peer IDs
    
    private var messagesSent: Int = 0
    private var messagesReceived: Int = 0
    
    private var lastMessageSentDate: Date?
    private var lastMessageReceivedDate: Date?

    private var latency: (average: Double, min: Double, max: Double) = (0, 0, 0)
    private var bandwidth: (upload: Double, download: Double) = (0, 0)
    private var packetLoss: Double = 0
    
    private override init() {
        self.context = CoreDataStack.shared.viewContext
        self.startTime = Date()
        self.persistenceAdapter = IOSPersistenceAdapter(context: context)
        super.init()
        
        BluetoothMeshManager.shared.delegate = self
        WebRTCManager.shared.delegate = self
    }
    
    /**
     * Starts the mesh network.
     */
    func start() {
        logger.info("Starting MeshNetworkManager")
        BluetoothMeshManager.shared.start()
        // WebRTCManager is initialized lazily but we can ensure it's ready
        _ = WebRTCManager.shared
        
        // Retry any queued messages from persistence
        Task {
            await retryQueuedMessages()
        }
    }
    
    /**
     * Stops the mesh network.
     */
    func stop() {
        logger.info("Stopping MeshNetworkManager")
        BluetoothMeshManager.shared.stop()
        // WebRTC cleanup if needed
    }
    
    /**
     * Retry queued messages from persistence adapter
     * Called on startup and when new peers connect
     */
    private func retryQueuedMessages() async {
        do {
            let queuedMessages = await persistenceAdapter.getAllMessages()
            logger.info("Retrying \(queuedMessages.count) queued messages from persistence")
            
            for (id, storedMessage) in queuedMessages {
                let peerId = storedMessage.destinationPeerId
                
                if isConnected(toPeerId: peerId) {
                    // Attempt to send
                    let success = await sendStoredMessage(storedMessage, toPeerId: peerId)
                    
                    if success {
                        // Remove from queue on success
                        await persistenceAdapter.removeMessage(id: id)
                        logger.info("Successfully sent queued message \(id) to \(peerId)")
                    } else {
                        // Update retry metadata
                        await persistenceAdapter.updateMessage(
                            id: id,
                            attempts: storedMessage.attempts + 1,
                            lastAttempt: Date(),
                            success: false
                        )
                    }
                } else {
                    logger.debug("Peer \(peerId) not connected, keeping message \(id) in queue")
                }
            }
            
            // Prune expired messages
            await persistenceAdapter.pruneExpired(now: Date())
            
        } catch {
            logger.error("Failed to retry queued messages: \(error.localizedDescription)")
        }
    }
    
    /**
     * Check if connected to a peer via any transport
     */
    private func isConnected(toPeerId peerId: String) -> Bool {
        return BluetoothMeshManager.shared.isConnected(toPeerId: peerId) ||
               WebRTCManager.shared.getConnectionState(for: peerId) == .connected
    }
    
    /**
     * Send a stored message (from queue)
     */
    private func sendStoredMessage(_ storedMessage: IOSPersistenceAdapter.CoreStoredMessage, toPeerId peerId: String) async -> Bool {
        let data = storedMessage.message.payload
        
        // Try WebRTC first
        if WebRTCManager.shared.getConnectionState(for: peerId) == .connected {
            if WebRTCManager.shared.send(data: data, to: peerId) {
                messagesSent += 1
                lastMessageSentDate = Date()
                return true
            }
        }
        
        // Fallback to BLE
        if BluetoothMeshManager.shared.isConnected(toPeerId: peerId) {
            if BluetoothMeshManager.shared.send(message: data, toPeerId: peerId) {
                messagesSent += 1
                lastMessageSentDate = Date()
                return true
            }
        }
        
        return false
    }
    
    /**
     * Sends a message to a recipient in the mesh network.
     */
    func sendMessage(recipientId: String, messageContent: String) {
        let message = Message(id: UUID(), timestamp: Date(), payload: messageContent)
        guard let data = try? JSONEncoder().encode(message) else {
            logger.error("Failed to encode message")
            return
        }
        
        // 1. Try WebRTC (High Bandwidth)
        if WebRTCManager.shared.getConnectionState(for: recipientId) == .connected {
            let success = WebRTCManager.shared.send(data: data, to: recipientId)
            if success {
                messagesSent += 1
                lastMessageSentDate = Date()
                logger.info("Message sent via WebRTC to \(recipientId)")
                return
            }
        }
        
        // 2. Try BLE (Low Bandwidth / Proximity)
        if BluetoothMeshManager.shared.isConnected(toPeerId: recipientId) {
            let success = BluetoothMeshManager.shared.send(message: data, toPeerId: recipientId)
            if success {
                messagesSent += 1
                lastMessageSentDate = Date()
                logger.info("Message sent via BLE to \(recipientId)")
                return
            }
        }
        
        // 3. Store-and-Forward (Offline) - Use unified persistence
        logger.info("Peer \(recipientId) offline, queuing message")
        Task {
            await queueMessage(payload: data, recipientId: recipientId)
        }
    }
    
    /**
     * Queue message using unified persistence adapter
     */
    private func queueMessage(payload: Data, recipientId: String) async {
        do {
            let id = UUID().uuidString
            
            // Get local peer ID
            let senderIdString = UserDefaults.standard.string(forKey: "localPeerId") ?? UUID().uuidString
            let senderIdData = senderIdString.data(using: .utf8) ?? Data(repeating: 0, count: 32)
            
            // Create message using core structure
            let message = IOSPersistenceAdapter.CoreMessage(
                header: IOSPersistenceAdapter.MessageHeader(
                    version: 1,
                    type: 0, // TEXT type
                    ttl: 10,
                    timestamp: UInt64(Date().timeIntervalSince1970 * 1000),
                    senderId: senderIdData.count >= 32 ? senderIdData.prefix(32) : (senderIdData + Data(repeating: 0, count: 32 - senderIdData.count)),
                    signature: Data(repeating: 0, count: 64) // Placeholder - should be signed
                ),
                payload: payload
            )
            
            let storedMessage = IOSPersistenceAdapter.CoreStoredMessage(
                message: message,
                destinationPeerId: recipientId,
                attempts: 0,
                lastAttempt: Date(),
                expiresAt: Date().addingTimeInterval(IOSPersistenceAdapter.DEFAULT_MESSAGE_EXPIRATION_MS)
            )
            
            // Save to unified persistence adapter
            await persistenceAdapter.saveMessage(id: id, message: storedMessage)
            logger.info("Message queued with ID: \(id)")
            
        } catch {
            logger.error("Failed to queue message for \(recipientId): \(error.localizedDescription)")
        }
    }
    
    /**
     * Retry sending pending messages for a peer (called when peer connects)
     */
    private func retryPendingMessages(for peerId: String) {
        Task {
            await retryQueuedMessages()
        }
    }

    /**
     * Get network statistics.
     */
    func getStats() -> NetworkStats {
        let uptime = Date().timeIntervalSince(startTime)
        // Count WebRTC connections
        // Note: This is a simplification, ideally WebRTCManager exposes a count or list
        let webrtcCount = 0 // Placeholder as WebRTCManager doesn't expose list directly yet
        
        return NetworkStats(
            connectedPeers: connectedPeers.count,
            messagesSent: messagesSent,
            messagesReceived: messagesReceived,
            bandwidth: bandwidth,
            latency: latency,
            packetLoss: packetLoss,
            uptime: uptime,
            bleConnections: connectedPeers.count, // Simplified
            webrtcConnections: webrtcCount,
            error: nil
        )
    }
    
    private func handleIncomingMessage(data: Data, from peerId: String) {
        guard let message = try? JSONDecoder().decode(Message.self, from: data) else {
            logger.error("Failed to decode received message from \(peerId)")
            return
        }
        
        logger.info("Received message from \(peerId): \(message.payload)")
        messagesReceived += 1
        lastMessageReceivedDate = Date()
        
        // Save received message
        context.perform {
            let entity = MessageEntity(context: self.context)
            entity.id = message.id.uuidString
            entity.conversationId = peerId
            entity.senderId = peerId
            entity.content = message.payload
            entity.timestamp = message.timestamp
            entity.status = "delivered" // Received
            entity.isEncrypted = false
            
            CoreDataStack.shared.save(context: self.context)
        }
        
        // Update stats (simplified)
        let currentLatency = Date().timeIntervalSince(message.timestamp)
        latency.average = (latency.average * Double(messagesReceived - 1) + currentLatency) / Double(messagesReceived)
    }
}

// MARK: - BluetoothMeshManagerDelegate

extension MeshNetworkManager: BluetoothMeshManagerDelegate {
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didReceiveMessage data: Data, from peerId: String) {
        handleIncomingMessage(data: data, from: peerId)
    }
    
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didConnectToPeer peerId: String) {
        logger.info("Connected to peer via BLE: \(peerId)")
        DispatchQueue.main.async {
            if !self.connectedPeers.contains(peerId) {
                self.connectedPeers.append(peerId)
            }
        }
        
        // Trigger Sneakernet retry
        retryPendingMessages(for: peerId)
    }
    
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didDisconnectFromPeer peerId: String) {
        logger.info("Disconnected from peer via BLE: \(peerId)")
        DispatchQueue.main.async {
            // Only remove if also not connected via WebRTC
            if WebRTCManager.shared.getConnectionState(for: peerId) != .connected {
                self.connectedPeers.removeAll { $0 == peerId }
            }
        }
    }
}

// MARK: - WebRTCManagerDelegate

extension MeshNetworkManager: WebRTCManagerDelegate {
    func webRTCManager(_ manager: WebRTCManager, didReceiveData data: Data, from peerId: String) {
        handleIncomingMessage(data: data, from: peerId)
    }
    
    func webRTCManager(_ manager: WebRTCManager, didOpenDataChannelFor peerId: String) {
        logger.info("WebRTC Data Channel opened for: \(peerId)")
        DispatchQueue.main.async {
            if !self.connectedPeers.contains(peerId) {
                self.connectedPeers.append(peerId)
            }
        }
        retryPendingMessages(for: peerId)
    }
    
    func webRTCManager(_ manager: WebRTCManager, didCloseDataChannelFor peerId: String) {
        logger.info("WebRTC Data Channel closed for: \(peerId)")
        DispatchQueue.main.async {
            // Only remove if also not connected via BLE
            if !BluetoothMeshManager.shared.isConnected(toPeerId: peerId) {
                self.connectedPeers.removeAll { $0 == peerId }
            }
        }
    }
    
    func webRTCManager(_ manager: WebRTCManager, didGenerateIceCandidate candidate: RTCIceCandidate, for peerId: String) {
        // Send candidate via signaling channel (e.g. BLE or HTTP)
        // This part requires a signaling mechanism which is likely handled by the upper layer or a separate SignalingManager
        // For now, we log it
        logger.debug("Generated ICE candidate for \(peerId)")
    }
}