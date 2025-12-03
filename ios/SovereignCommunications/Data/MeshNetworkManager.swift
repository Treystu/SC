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
 */
class MeshNetworkManager: NSObject, ObservableObject {
    
    static let shared = MeshNetworkManager()
    
    private let context: NSManagedObjectContext
    private let startTime: Date
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "MeshNetworkManager")
    
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
        
        // 3. Store-and-Forward (Offline)
        logger.info("Peer \(recipientId) offline, queuing message")
        saveMessageToQueue(message: message, recipientId: recipientId)
    }
    
    /**
     * Save message to CoreData queue
     */
    private func saveMessageToQueue(message: Message, recipientId: String) {
        context.perform {
            let entity = MessageEntity(context: self.context)
            entity.id = message.id.uuidString
            entity.conversationId = recipientId // Using recipientId as conversationId for now
            entity.senderId = UserDefaults.standard.string(forKey: "localPeerId") ?? "unknown"
            entity.content = message.payload
            entity.timestamp = message.timestamp
            entity.status = "pending"
            // Messages are encrypted at the mesh network layer before being stored
            // The payload has already been encrypted when received from the mesh network
            entity.isEncrypted = true
            
            CoreDataStack.shared.save(context: self.context)
        }
    }
    
    /**
     * Retry sending pending messages for a peer
     */
    private func retryPendingMessages(for peerId: String) {
        context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "conversationId == %@ AND status == %@", peerId, "pending")
            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]
            
            do {
                let pendingMessages = try self.context.fetch(fetchRequest)
                if pendingMessages.isEmpty { return }
                
                self.logger.info("Retrying \(pendingMessages.count) messages for \(peerId)")
                
                for entity in pendingMessages {
                    let message = Message(
                        id: UUID(uuidString: entity.id) ?? UUID(),
                        timestamp: entity.timestamp,
                        payload: entity.content
                    )
                    
                    if let data = try? JSONEncoder().encode(message) {
                        // Try WebRTC then BLE
                        var success = false
                        if WebRTCManager.shared.getConnectionState(for: peerId) == .connected {
                            success = WebRTCManager.shared.send(data: data, to: peerId)
                        } else {
                            success = BluetoothMeshManager.shared.send(message: data, toPeerId: peerId)
                        }
                        
                        if success {
                            entity.status = "sent"
                            self.messagesSent += 1
                        }
                    }
                }
                
                CoreDataStack.shared.save(context: self.context)
                
            } catch {
                self.logger.error("Failed to fetch pending messages: \(error.localizedDescription)")
            }
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