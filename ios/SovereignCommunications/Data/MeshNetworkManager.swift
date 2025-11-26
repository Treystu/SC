//
//  MeshNetworkManager.swift
//  SovereignCommunications
//
//  Created by Your Name on 2023-10-27.
//

import Foundation
import CoreData
import CoreBluetooth

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
 */
class MeshNetworkManager: NSObject, CBPeripheralManagerDelegate, CBCentralManagerDelegate, ObservableObject {
    
    static let serviceUUID = CBUUID(string: "0000DEAD-BEEF-1000-8000-00805F9B34FB")
    static let characteristicUUID = CBUUID(string: "0000DEAD-BEEF-1001-8000-00805F9B34FB")
    static let shared = MeshNetworkManager()
    
    private let context: NSManagedObjectContext
    private let startTime: Date
    
    private var peripheralManager: CBPeripheralManager!
    private var centralManager: CBCentralManager!
    
    @Published var discoveredPeers: [CBPeripheral] = []
    @Published var connectedPeers: [CBPeripheral] = []
    private var connectedPeersDict: [UUID: CBPeripheral] = [:] {
        didSet {
            connectedPeers = Array(connectedPeersDict.values)
        }
    }
    private var messagesSent: Int = 0
    private var messagesReceived: Int = 0
    private var bleConnections: Int = 0
    private var webrtcConnections: Int = 0
    
    private var lastMessageSentDate: Date?
    private var lastMessageReceivedDate: Date?

    private var latency: (average: Double, min: Double, max: Double) = (0, 0, 0)
    private var bandwidth: (upload: Double, download: Double) = (0, 0)
    private var packetLoss: Double = 0
    
    private override init() {
        self.context = CoreDataStack.shared.viewContext
        self.startTime = Date()
        super.init()
    }
    
    /**
     * Starts the mesh network.
     * This includes initializing the identity, starting peer discovery (BLE, WebRTC),
     * and setting up message handlers.
     */
    func start() {
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    /**
     * Stops the mesh network.
     * This includes closing all peer connections, stopping discovery services,
     * and saving any necessary state.
     */
    func stop() {
        peripheralManager.stopAdvertising()
        centralManager.stopScan()
    }
    
    /**
     * Sends a message to a recipient in the mesh network.
     */
    func sendMessage(recipientId: String, message: String) {
        let message = Message(id: UUID(), timestamp: Date(), payload: message)
        guard let data = try? JSONEncoder().encode(message) else { return }
        
        guard let recipientUUID = UUID(uuidString: recipientId),
              let peripheral = connectedPeersDict[recipientUUID] else { return }

        if let characteristic = peripheral.services?.first?.characteristics?.first(where: { $0.uuid == MeshNetworkManager.characteristicUUID }) {
            peripheral.writeValue(data, for: characteristic, type: .withResponse)
            messagesSent += 1
            lastMessageSentDate = Date()
        }
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
            bleConnections: bleConnections,
            webrtcConnections: webrtcConnections,
            error: nil
        )
    }
    
    // MARK: - CBPeripheralManagerDelegate
    
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            let service = CBMutableService(type: MeshNetworkManager.serviceUUID, primary: true)
            let characteristic = CBMutableCharacteristic(type: MeshNetworkManager.characteristicUUID, properties: [.write, .read, .notify], value: nil, permissions: [.readable, .writeable])
            service.characteristics = [characteristic]
            peripheralManager.add(service)
        } else {
            // Handle other states
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBMutableService, error: Error?) {
        if error == nil {
            peripheral.startAdvertising([CBAdvertisementDataServiceUUIDsKey: [MeshNetworkManager.serviceUUID]])
        } else {
            // Handle error
        }
    }
    
    // MARK: - CBCentralManagerDelegate
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            central.scanForPeripherals(withServices: [MeshNetworkManager.serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        } else {
            // Handle other states
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        if !discoveredPeers.contains(peripheral) {
            discoveredPeers.append(peripheral)
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([MeshNetworkManager.serviceUUID])
        connectedPeersDict[peripheral.identifier] = peripheral
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        connectedPeersDict.removeValue(forKey: peripheral.identifier)
    }

    func getConnectedPeers() -> [CBPeripheral] {
        return connectedPeers
    }

    func connect(to peer: CBPeripheral) {
        centralManager.connect(peer, options: nil)
    }
}

extension MeshNetworkManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics([MeshNetworkManager.characteristicUUID], for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }
        for characteristic in characteristics {
            if characteristic.uuid == MeshNetworkManager.characteristicUUID {
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let data = characteristic.value {
            if let message = try? JSONDecoder().decode(Message.self, from: data) {
                messagesReceived += 1
                lastMessageReceivedDate = Date()
                
                let currentLatency = Date().timeIntervalSince(message.timestamp)
                
                // Update latency stats
                if latency.min == 0 || currentLatency < latency.min {
                    latency.min = currentLatency
                }
                if currentLatency > latency.max {
                    latency.max = currentLatency
                }
                latency.average = (latency.average * Double(messagesReceived - 1) + currentLatency) / Double(messagesReceived)
                
                // Update bandwidth stats
                let dataSize = Double(data.count)
                if let lastDate = lastMessageReceivedDate {
                    let timeDiff = Date().timeIntervalSince(lastDate)
                    if timeDiff > 0 {
                        bandwidth.download = dataSize / timeDiff
                    }
                }

                print("Received message: '\(message.payload)' with latency: \(currentLatency)s")
            }
        }
    }
}