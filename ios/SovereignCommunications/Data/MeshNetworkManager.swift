//
//  MeshNetworkManager.swif
//  SovereignCommunications
//
//  Created by Your Name on 2023-10-27.
//

import Foundation
import CoreData
import CoreBluetooth
import os.log
import WebRTC
import Network

struct Message: Codable {
    let id: UUID
    let timestamp: Date
    let payload: String
}

struct NetworkStats {
    var connectedPeers: In
    var messagesSent: In
    var messagesReceived: In
    var bandwidth: (upload: Double, download: Double)
    var latency: (average: Double, min: Double, max: Double)
    var packetLoss: Double
    var uptime: TimeInterval
    var bleConnections: In
    var webrtcConnections: In
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

    private let context: NSManagedObjectContex
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
        self.context = CoreDataStack.shared.viewContex
        self.startTime = Date()
        self.persistenceAdapter = IOSPersistenceAdapter(context: context)
        super.init()

        BluetoothMeshManager.shared.delegate = self
        WebRTCManager.shared.delegate = self

        setupJSBridge()
    }

    private func setupJSBridge() {
        // Handle outbound messages from JS Core -> Native Transports
        JSBridge.shared.outboundCallback = { [weak self] peerId, data in
            self?.routeOutboundPacket(data, to: peerId)
        }

        // Handle application messages from JS Core -> UI
        JSBridge.shared.applicationMessageCallback = { [weak self] jsonString in
            self?.handleCoreApplicationMessage(jsonString)
        }

        LocalNetworkManager.shared.delegate = self
    }

    /**
     * Starts the network.
     */
    func start() {
        logger.info("Starting MeshNetworkManager and JS Bridge")
        BluetoothMeshManager.shared.start()
        LocalNetworkManager.shared.start()
        _ = WebRTCManager.shared
    }

    /**
     * Stops the network.
     */
    func stop() {
        logger.info("Stopping MeshNetworkManager")
        BluetoothMeshManager.shared.stop()
        LocalNetworkManager.shared.stop()
    }

    // MARK: - Core Routing

    /**
     * Route a packet from JS Core to the appropriate Native Transpor
     */
    private func routeOutboundPacket(_ data: Data, to peerId: String) {
        // 1. Try WebRTC
        if WebRTCManager.shared.getConnectionState(for: peerId) == .connected {
            if WebRTCManager.shared.send(data: data, to: peerId) {
                messagesSent += 1
                return
            }
        }

        // 2. Try Local Network (TCP)
        LocalNetworkManager.shared.send(data: data, to: peerId)
        // We don't check success here as send is async, but assume success for flow
        // Or check connection existence first?

        // 3. Try BLE
        if BluetoothMeshManager.shared.isConnected(toPeerId: peerId) {
            if BluetoothMeshManager.shared.send(message: data, toPeerId: peerId) {
                messagesSent += 1
                return
            }
        }

        // logger.warning("Failed to route outbound packet to \(peerId) - No transport available")
        // Note: JS Core should handle queuing/persistence if retry is needed,
        // provided we gave it a configured PersistenceAdapter.
    }

    /**
     * Handle decrypted application message from JS Core
     */
    private func handleCoreApplicationMessage(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let message = try? JSONDecoder().decode(Message.self, from: data) else {
            logger.error("Failed to decode application message from Core")
            return
        }

        // Save to CoreData for UI
        context.perform {
            let entity = MessageEntity(context: self.context)
            entity.id = message.id.uuidString
            entity.conversationId = "sub-sender-id" // TODO: Extract real sender from message wrapper
            entity.senderId = "unknown" // JS Core message usually wraps senderId
            entity.content = message.payload
            entity.timestamp = message.timestamp
            entity.status = "delivered"
            entity.isEncrypted = false

            CoreDataStack.shared.save(context: self.context)
        }

        messagesReceived += 1
    }

    /**
     * Sends a message from UI -> JS Core.
     */
    func sendMessage(recipientId: String, messageContent: String) {
        JSBridge.shared.sendMessage(to: recipientId, content: messageContent)
    }

    /**
     * Get network statistics.
     */
    func getStats() -> NetworkStats {
        let uptime = Date().timeIntervalSince(startTime)
        return NetworkStats(
            connectedPeers: connectedPeers.count,
            messagesSent: messagesSent,
            messagesReceived: messagesReceived,
            bandwidth: bandwidth,
            latency: latency,
            packetLoss: packetLoss,
            uptime: uptime,
            bleConnections: connectedPeers.count,
            webrtcConnections: 0,
            error: nil
        )
    }

    // MARK: - Incoming Transport Handlers

    private func passToCore(data: Data, from peerId: String) {
        JSBridge.shared.handleIncomingPacket(data: data, from: peerId)
    }
}

// MARK: - BluetoothMeshManagerDelegate

extension MeshNetworkManager: BluetoothMeshManagerDelegate {
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didReceiveMessage data: Data, from peerId: String) {
        passToCore(data: data, from: peerId)
    }

    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didConnectToPeer peerId: String) {
        logger.info("Connected to peer via BLE: \(peerId)")
        DispatchQueue.main.async {
            if !self.connectedPeers.contains(peerId) {
                self.connectedPeers.append(peerId)
            }
        }
        // TODO: Inform JS Core about connection status change?
    }

    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didDisconnectFromPeer peerId: String) {
        logger.info("Disconnected from peer via BLE: \(peerId)")
        DispatchQueue.main.async {
            self.connectedPeers.removeAll { $0 == peerId }
        }
    }
}

// MARK: - WebRTCManagerDelegate

extension MeshNetworkManager: WebRTCManagerDelegate {
    func webRTCManager(_ manager: WebRTCManager, didReceiveData data: Data, from peerId: String) {
        passToCore(data: data, from: peerId)
    }

    func webRTCManager(_ manager: WebRTCManager, didOpenDataChannelFor peerId: String) {
        DispatchQueue.main.async {
            if !self.connectedPeers.contains(peerId) {
                self.connectedPeers.append(peerId)
            }
        }
    }

    func webRTCManager(_ manager: WebRTCManager, didCloseDataChannelFor peerId: String) {
        DispatchQueue.main.async {
             self.connectedPeers.removeAll { $0 == peerId }
        }
    }

    func webRTCManager(_ manager: WebRTCManager, didGenerateIceCandidate candidate: RTCIceCandidate, for peerId: String) {
        // Handled by signaling layer
    }
}

// MARK: - LocalNetworkManagerDelegate

extension MeshNetworkManager: LocalNetworkManagerDelegate {
    func didReceiveData(_ data: Data, from peerId: String) {
        passToCore(data: data, from: peerId)
    }

    func didConnect(peerId: String) {
        logger.info("Connected to peer via Local Network: \(peerId)")
        DispatchQueue.main.async {
            if !self.connectedPeers.contains(peerId) {
                self.connectedPeers.append(peerId)
            }
        }
    }

    func didDisconnect(peerId: String) {
        logger.info("Disconnected from peer via Local Network: \(peerId)")
        DispatchQueue.main.async {
            self.connectedPeers.removeAll { $0 == peerId }
        }
    }
}

// MARK: - Local Discovery & Transport (mDNS + TCP)

protocol LocalNetworkManagerDelegate: AnyObject {
    func didReceiveData(_ data: Data, from peerId: String)
    func didConnect(peerId: String)
    func didDisconnect(peerId: String)
}

class LocalNetworkManager {
    static let shared = LocalNetworkManager()

    private let serviceType = "_sc._tcp"
    private var listener: NWListener?
    private var browser: NWBrowser?

    // PeerID -> Connection
    private var connections: [String: NWConnection] = [:]
    // Connection -> PeerID (reverse lookup)
    private var connectionMap: [UUID: String] = [:]

    weak var delegate: LocalNetworkManagerDelegate?
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "LocalNetwork")

    // Internal queue
    private let queue = DispatchQueue(label: "com.sovereign.localnetwork")

    func start() {
        startAdvertising()
        startBrowsing()
    }

    func stop() {
        stopAdvertising()
        stopBrowsing()
        // Close all
        for conn in connections.values {
            conn.cancel()
        }
        connections.removeAll()
        connectionMap.removeAll()
    }

    func send(data: Data, to peerId: String) {
        guard let connection = connections[peerId] else {
            logger.warning("No local connection to \(peerId)")
            return
        }

        // Framing: Length Prefix (4 bytes)
        var length = UInt32(data.count).bigEndian
        let lengthData = Data(bytes: &length, count: 4)

        connection.send(content: lengthData + data, completion: .contentProcessed({ error in
            if let error = error {
                self.logger.error("Send failed: \(error.localizedDescription)")
            }
        }))
    }

    private func startAdvertising() {
        do {
            listener = try NWListener(using: .tcp)
            listener?.service = NWListener.Service(type: serviceType)
            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleNewConnection(connection)
            }
            listener?.start(queue: queue)
            logger.info("Started mDNS advertising: \(self.serviceType)")
        } catch {
            logger.error("Failed to start listener: \(error.localizedDescription)")
        }
    }

    private func stopAdvertising() {
        listener?.cancel()
        listener = nil
    }

    private func startBrowsing() {
        browser = NWBrowser(for: .bonjour(type: serviceType, domain: nil), using: .tcp)
        browser?.browseResultsChangedHandler = { [weak self] results, changes in
            for result in results {
                self?.connect(to: result.endpoint)
            }
        }
        browser?.start(queue: queue)
        logger.info("Started mDNS browsing")
    }

    private func stopBrowsing() {
        browser?.cancel()
        browser = nil
    }

    private func connect(to endpoint: NWEndpoint) {
        let connection = NWConnection(to: endpoint, using: .tcp)
        handleNewConnection(connection, initiated: true)
    }

    private func handleNewConnection(_ connection: NWConnection, initiated: Bool = false) {
        // Unique ID for this connection object until we know the PeerID
        let connectionUUID = UUID()

        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.logger.info("Local connection ready: \(connection)")
                self?.receiveNextPacket(connection, uuid: connectionUUID)
            case .failed(let error):
                self?.logger.error("Local connection failed: \(error.localizedDescription)")
                self?.cleanupConnection(uuid: connectionUUID)
            case .cancelled:
                self?.cleanupConnection(uuid: connectionUUID)
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func cleanupConnection(uuid: UUID) {
        queue.async { [weak self] in
             if let self = self {
                if let peerId = self.connectionMap[uuid] {
                    self.connections.removeValue(forKey: peerId)
                    self.connectionMap.removeValue(forKey: uuid)
                    self.delegate?.didDisconnect(peerId: peerId)
                }
             }
        }
    }

    private func receiveNextPacket(_ connection: NWConnection, uuid: UUID) {
        // Read 4 bytes length
        connection.receive(minimumIncompleteLength: 4, maximumLength: 4) { [weak self] content, context, isComplete, error in
            if let data = content, data.count == 4 {
                let length = data.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
                self?.readBody(connection, length: Int(length), uuid: uuid)
            } else {
                if let error = error {
                     self?.logger.error("Receive error: \(error.localizedDescription)")
                }
                connection.cancel()
            }
        }
    }

    private func readBody(_ connection: NWConnection, length: Int, uuid: UUID) {
        connection.receive(minimumIncompleteLength: length, maximumLength: length) { [weak self] content, context, isComplete, error in
            if let data = content, data.count == length {
                self?.handlePacket(data, connection: connection, uuid: uuid)
                self?.receiveNextPacket(connection, uuid: uuid) // loop
            } else {
                connection.cancel()
            }
        }
    }

    private func handlePacket(_ data: Data, connection: NWConnection, uuid: UUID) {
        queue.async { [weak self] in
            guard let self = self else { return }
            // Identify sender if unknown
            if self.connectionMap[uuid] == nil {
                // Extract Header (first 108 bytes, SenderID at offset 11, length 32)
                if data.count >= 43 {
                    // Offset 11 is start of SenderID (32 bytes)
                    let senderIdBytes = data.subdata(in: 11..<43)
                    let peerId = senderIdBytes.map { String(format: "%02x", $0) }.joined()

                    // Register
                    self.connections[peerId] = connection
                    self.connectionMap[uuid] = peerId
                    self.delegate?.didConnect(peerId: peerId)
                    self.logger.info("Identified peer on local network: \(peerId)")

                    self.delegate?.didReceiveData(data, from: peerId)
                }
            } else {
                // Known peer
                if let peerId = self.connectionMap[uuid] {
                    self.delegate?.didReceiveData(data, from: peerId)
                }
            }
        }
    }
}