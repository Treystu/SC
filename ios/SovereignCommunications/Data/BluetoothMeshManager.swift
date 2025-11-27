import Foundation
import CoreBluetooth

class BluetoothMeshManager: NSObject, CBCentralManagerDelegate, CBPeripheralManagerDelegate {
    
    // MARK: - Properties
    
    private var centralManager: CBCentralManager!
    private var peripheralManager: CBPeripheralManager!
    
    private var discoveredPeripherals: [CBPeripheral] = []
    private var connectedPeripherals: [CBPeripheral] = []
    
    private var reassemblyBuffers: [UUID: Data] = [:]
    
    private let serviceUUID = CBUUID(string: "00001820-0000-1000-8000-00805f9b34fb")
    private let characteristicUUID = CBUUID(string: "00002a0f-0000-1000-8000-00805f9b34fb")
    
    // MARK: - Initialization
    
    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: nil)
        peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
    }
    
    // MARK: - Public Methods
    
    func send(data: Data, to peripheral: CBPeripheral) {
        guard let characteristic = peripheral.services?.first?.characteristics?.first else { return }
        let fragments = fragment(data: data)
        for fragment in fragments {
            peripheral.writeValue(fragment, for: characteristic, type: .withResponse)
        }
    }
    
    // MARK: - Private Methods
    
    private func startAdvertising() {
        guard peripheralManager.state == .poweredOn else { return }
        let advertisementData: [String: Any] = [
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID]
        ]
        peripheralManager.startAdvertising(advertisementData)
    }
    
    private func startScanning() {
        guard centralManager.state == .poweredOn else { return }
        centralManager.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
    }
    
    private func setupPeripheral() {
        guard peripheralManager.state == .poweredOn else { return }
        
        let characteristic = CBMutableCharacteristic(type: characteristicUUID,
                                                     properties: [.read, .write, .notify],
                                                     value: nil,
                                                     permissions: [.readable, .writeable])
        
        let service = CBMutableService(type: serviceUUID, primary: true)
        service.characteristics = [characteristic]
        
        peripheralManager.add(service)
    }
    
    private func fragment(data: Data) -> [Data] {
        let chunkSize = 20 // MTU - 3
        var fragments: [Data] = []
        var offset = 0
        while offset < data.count {
            let chunk = data.subdata(in: offset..<min(offset + chunkSize, data.count))
            fragments.append(chunk)
            offset += chunkSize
        }
        return fragments
    }
    
    private func reassemble(data: Data, from peripheral: CBPeripheral) -> Data? {
        var buffer = reassemblyBuffers[peripheral.identifier] ?? Data()
        buffer.append(data)
        reassemblyBuffers[peripheral.identifier] = buffer
        
        // Naive reassembly based on a delimiter
        if buffer.last == 0x00 {
            reassemblyBuffers.removeValue(forKey: peripheral.identifier)
            return buffer
        }
        return nil
    }
    
    private func relay(message: Data, from peripheral: CBPeripheral) {
        for connectedPeripheral in connectedPeripherals {
            if connectedPeripheral != peripheral {
                send(data: message, to: connectedPeripheral)
            }
        }
    }
    
    // MARK: - CBCentralManagerDelegate
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            startScanning()
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        if !discoveredPeripherals.contains(peripheral) {
            discoveredPeripherals.append(peripheral)
            centralManager.connect(peripheral, options: nil)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices([serviceUUID])
        connectedPeripherals.append(peripheral)
    }
    
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        print("Failed to connect to peripheral: \(error?.localizedDescription ?? "Unknown error")")
    }
    
    // MARK: - CBPeripheralManagerDelegate
    
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        if peripheral.state == .poweredOn {
            setupPeripheral()
        }
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error = error {
            print("Error adding service: \(error.localizedDescription)")
            return
        }
        startAdvertising()
    }
}

// MARK: - CBPeripheralDelegate
extension BluetoothMeshManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services {
            peripheral.discoverCharacteristics([characteristicUUID], for: service)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristics = service.characteristics else { return }
        for characteristic in characteristics {
            peripheral.setNotifyValue(true, for: characteristic)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard let data = characteristic.value else { return }
        if let reassembledMessage = reassemble(data: data, from: peripheral) {
            relay(message: reassembledMessage, from: peripheral)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("Error writing to characteristic: \(error.localizedDescription)")
            return
        }
    }
}