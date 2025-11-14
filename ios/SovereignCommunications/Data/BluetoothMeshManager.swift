//
//  BluetoothMeshManager.swift
//  Sovereign Communications
//
//  CoreBluetooth manager for BLE mesh networking with state restoration
//

import Foundation
import CoreBluetooth
import os.log

/// Manages Bluetooth LE mesh networking for peer-to-peer communication
class BluetoothMeshManager: NSObject {
    static let shared = BluetoothMeshManager()
    
    // Service and characteristic UUIDs
    static let meshServiceUUID = CBUUID(string: "12345678-1234-5678-1234-56789ABCDEF0")
    static let messageCharacteristicUUID = CBUUID(string: "12345678-1234-5678-1234-56789ABCDEF1")
    static let peerIdCharacteristicUUID = CBUUID(string: "12345678-1234-5678-1234-56789ABCDEF2")
    static let statusCharacteristicUUID = CBUUID(string: "12345678-1234-5678-1234-56789ABCDEF3")
    
    // Restoration identifier for state preservation
    static let centralRestorationIdentifier = "com.sovereign.communications.central"
    static let peripheralRestorationIdentifier = "com.sovereign.communications.peripheral"
    
    private var centralManager: CBCentralManager!
    private var peripheralManager: CBPeripheralManager!
    
    private var discoveredPeripherals: [UUID: CBPeripheral] = [:]
    private var connectedPeripherals: Set<CBPeripheral> = []
    
    private var messageCharacteristic: CBMutableCharacteristic?
    private var peerIdCharacteristic: CBMutableCharacteristic?
    private var statusCharacteristic: CBMutableCharacteristic?
    
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "Bluetooth")
    
    // Delegate for receiving messages
    weak var delegate: BluetoothMeshManagerDelegate?
    
    private override init() {
        super.init()
        
        // Initialize central manager with state restoration
        let centralOptions: [String: Any] = [
            CBCentralManagerOptionRestoreIdentifierKey: Self.centralRestorationIdentifier,
            CBCentralManagerOptionShowPowerAlertKey: true
        ]
        centralManager = CBCentralManager(delegate: self, queue: nil, options: centralOptions)
        
        // Initialize peripheral manager with state restoration
        let peripheralOptions: [String: Any] = [
            CBPeripheralManagerOptionRestoreIdentifierKey: Self.peripheralRestorationIdentifier,
            CBPeripheralManagerOptionShowPowerAlertKey: true
        ]
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil, options: peripheralOptions)
    }
    
    // MARK: - Public API
    
    /// Start advertising and scanning for mesh peers
    func start() {
        logger.info("Starting Bluetooth mesh networking")
        
        if centralManager.state == .poweredOn {
            startScanning()
        }
        
        if peripheralManager.state == .poweredOn {
            setupPeripheralServices()
            startAdvertising()
        }
    }
    
    /// Stop advertising and scanning
    func stop() {
        logger.info("Stopping Bluetooth mesh networking")
        
        centralManager.stopScan()
        peripheralManager.stopAdvertising()
        
        // Disconnect all peripherals
        for peripheral in connectedPeripherals {
            centralManager.cancelPeripheralConnection(peripheral)
        }
        connectedPeripherals.removeAll()
    }
    
    /// Send a message to all connected peers
    func broadcast(message: Data) {
        guard let characteristic = messageCharacteristic else {
            logger.error("Message characteristic not set up")
            return
        }
        
        let success = peripheralManager.updateValue(
            message,
            for: characteristic,
            onSubscribedCentrals: nil
        )
        
        if success {
            logger.debug("Broadcasted message to subscribers")
        } else {
            logger.warning("Failed to broadcast message - queue full")
        }
    }
    
    /// Send a message to a specific peer
    func send(message: Data, to peripheral: CBPeripheral) {
        guard let services = peripheral.services,
              let service = services.first(where: { $0.uuid == Self.meshServiceUUID }),
              let characteristics = service.characteristics,
              let characteristic = characteristics.first(where: { $0.uuid == Self.messageCharacteristicUUID }) else {
            logger.error("Cannot send message - characteristic not found")
            return
        }
        
        peripheral.writeValue(message, for: characteristic, type: .withResponse)
        logger.debug("Sent message to peer \(peripheral.identifier)")
    }
    
    // MARK: - Central Manager (Client)
    
    private func startScanning() {
        let services = [Self.meshServiceUUID]
        let options: [String: Any] = [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ]
        
        centralManager.scanForPeripherals(withServices: services, options: options)
        logger.info("Started scanning for mesh peers")
    }
    
    private func connectToPeripheral(_ peripheral: CBPeripheral) {
        peripheral.delegate = self
        centralManager.connect(peripheral, options: nil)
        logger.info("Connecting to peripheral \(peripheral.identifier)")
    }
    
    // MARK: - Peripheral Manager (Server)
    
    private func setupPeripheralServices() {
        // Create message characteristic (notify, write)
        messageCharacteristic = CBMutableCharacteristic(
            type: Self.messageCharacteristicUUID,
            properties: [.notify, .write, .writeWithoutResponse],
            value: nil,
            permissions: [.readable, .writeable]
        )
        
        // Create peer ID characteristic (read)
        let peerId = UserDefaults.standard.string(forKey: "localPeerId") ?? UUID().uuidString
        let peerIdData = peerId.data(using: .utf8)
        peerIdCharacteristic = CBMutableCharacteristic(
            type: Self.peerIdCharacteristicUUID,
            properties: [.read],
            value: peerIdData,
            permissions: [.readable]
        )
        
        // Create status characteristic (read, notify)
        statusCharacteristic = CBMutableCharacteristic(
            type: Self.statusCharacteristicUUID,
            properties: [.read, .notify],
            value: Data([0x01]), // Status: online
            permissions: [.readable]
        )
        
        // Create service with characteristics
        let service = CBMutableService(type: Self.meshServiceUUID, primary: true)
        service.characteristics = [
            messageCharacteristic!,
            peerIdCharacteristic!,
            statusCharacteristic!
        ]
        
        // Add service to peripheral manager
        peripheralManager.add(service)
        logger.info("Added mesh service with characteristics")
    }
    
    private func startAdvertising() {
        let advertisementData: [String: Any] = [
            CBAdvertisementDataServiceUUIDsKey: [Self.meshServiceUUID],
            CBAdvertisementDataLocalNameKey: "SC-Mesh"
        ]
        
        peripheralManager.startAdvertising(advertisementData)
        logger.info("Started advertising mesh service")
    }
}

// MARK: - CBCentralManagerDelegate

extension BluetoothMeshManager: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        logger.info("Central manager state: \(central.state.description)")
        
        switch central.state {
        case .poweredOn:
            startScanning()
        case .poweredOff:
            logger.warning("Bluetooth is powered off")
        case .unauthorized:
            logger.error("Bluetooth is unauthorized")
        case .unsupported:
            logger.error("Bluetooth is unsupported")
        default:
            break
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                       advertisementData: [String: Any], rssi RSSI: NSNumber) {
        logger.info("Discovered peripheral: \(peripheral.identifier), RSSI: \(RSSI)")
        
        discoveredPeripherals[peripheral.identifier] = peripheral
        
        // Auto-connect to discovered mesh peers
        if !connectedPeripherals.contains(peripheral) {
            connectToPeripheral(peripheral)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        logger.info("Connected to peripheral: \(peripheral.identifier)")
        
        connectedPeripherals.insert(peripheral)
        
        // Discover services
        peripheral.discoverServices([Self.meshServiceUUID])
        
        // Notify delegate
        delegate?.bluetoothMeshManager(self, didConnectToPeer: peripheral.identifier.uuidString)
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        logger.info("Disconnected from peripheral: \(peripheral.identifier)")
        
        connectedPeripherals.remove(peripheral)
        
        if let error = error {
            logger.error("Disconnect error: \(error.localizedDescription)")
        }
        
        // Notify delegate
        delegate?.bluetoothMeshManager(self, didDisconnectFromPeer: peripheral.identifier.uuidString)
        
        // Attempt to reconnect
        if centralManager.state == .poweredOn {
            connectToPeripheral(peripheral)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        logger.error("Failed to connect to peripheral: \(error?.localizedDescription ?? "unknown error")")
    }
    
    // State restoration
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        logger.info("Restoring central manager state")
        
        // Restore peripherals
        if let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral] {
            for peripheral in peripherals {
                logger.info("Restored peripheral: \(peripheral.identifier)")
                discoveredPeripherals[peripheral.identifier] = peripheral
                peripheral.delegate = self
            }
        }
        
        // Restore scan services
        if let services = dict[CBCentralManagerRestoredStateScanServicesKey] as? [CBUUID] {
            logger.info("Restored scan services: \(services)")
        }
    }
}

// MARK: - CBPeripheralDelegate

extension BluetoothMeshManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            logger.error("Error discovering services: \(error.localizedDescription)")
            return
        }
        
        guard let services = peripheral.services else { return }
        
        for service in services {
            logger.info("Discovered service: \(service.uuid)")
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error = error {
            logger.error("Error discovering characteristics: \(error.localizedDescription)")
            return
        }
        
        guard let characteristics = service.characteristics else { return }
        
        for characteristic in characteristics {
            logger.info("Discovered characteristic: \(characteristic.uuid)")
            
            // Subscribe to notifications
            if characteristic.properties.contains(.notify) {
                peripheral.setNotifyValue(true, for: characteristic)
            }
            
            // Read values
            if characteristic.properties.contains(.read) {
                peripheral.readValue(for: characteristic)
            }
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            logger.error("Error reading characteristic: \(error.localizedDescription)")
            return
        }
        
        guard let value = characteristic.value else { return }
        
        switch characteristic.uuid {
        case Self.messageCharacteristicUUID:
            logger.debug("Received message from \(peripheral.identifier)")
            delegate?.bluetoothMeshManager(self, didReceiveMessage: value, from: peripheral.identifier.uuidString)
            
        case Self.peerIdCharacteristicUUID:
            if let peerId = String(data: value, encoding: .utf8) {
                logger.info("Peer ID: \(peerId)")
            }
            
        case Self.statusCharacteristicUUID:
            logger.debug("Peer status updated")
            
        default:
            break
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            logger.error("Error writing characteristic: \(error.localizedDescription)")
        } else {
            logger.debug("Successfully wrote to characteristic")
        }
    }
}

// MARK: - CBPeripheralManagerDelegate

extension BluetoothMeshManager: CBPeripheralManagerDelegate {
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        logger.info("Peripheral manager state: \(peripheral.state.description)")
        
        switch peripheral.state {
        case .poweredOn:
            setupPeripheralServices()
            startAdvertising()
        case .poweredOff:
            logger.warning("Bluetooth is powered off")
        case .unauthorized:
            logger.error("Bluetooth is unauthorized")
        case .unsupported:
            logger.error("Bluetooth is unsupported")
        default:
            break
        }
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            logger.debug("Received write request for characteristic: \(request.characteristic.uuid)")
            
            if request.characteristic.uuid == Self.messageCharacteristicUUID,
               let value = request.value {
                // Handle received message
                delegate?.bluetoothMeshManager(self, didReceiveMessage: value, from: request.central.identifier.uuidString)
            }
            
            // Respond to request
            peripheralManager.respond(to: request, withResult: .success)
        }
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral,
                          didSubscribeTo characteristic: CBCharacteristic) {
        logger.info("Central \(central.identifier) subscribed to \(characteristic.uuid)")
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral,
                          didUnsubscribeFrom characteristic: CBCharacteristic) {
        logger.info("Central \(central.identifier) unsubscribed from \(characteristic.uuid)")
    }
    
    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        logger.debug("Peripheral manager ready to update subscribers")
    }
    
    // State restoration
    func peripheralManager(_ peripheral: CBPeripheralManager, willRestoreState dict: [String: Any]) {
        logger.info("Restoring peripheral manager state")
        
        // Restore services
        if let services = dict[CBPeripheralManagerRestoredStateServicesKey] as? [CBMutableService] {
            for service in services {
                logger.info("Restored service: \(service.uuid)")
            }
        }
        
        // Restore advertisement data
        if let advertisementData = dict[CBPeripheralManagerRestoredStateAdvertisementDataKey] as? [String: Any] {
            logger.info("Restored advertisement data: \(advertisementData)")
        }
    }
}

// MARK: - Delegate Protocol

protocol BluetoothMeshManagerDelegate: AnyObject {
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didReceiveMessage message: Data, from peerId: String)
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didConnectToPeer peerId: String)
    func bluetoothMeshManager(_ manager: BluetoothMeshManager, didDisconnectFromPeer peerId: String)
}

// MARK: - CBManagerState Extension

extension CBManagerState {
    var description: String {
        switch self {
        case .unknown: return "unknown"
        case .resetting: return "resetting"
        case .unsupported: return "unsupported"
        case .unauthorized: return "unauthorized"
        case .poweredOff: return "poweredOff"
        case .poweredOn: return "poweredOn"
        @unknown default: return "unknown"
        }
    }
}
