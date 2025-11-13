package com.sc.services

import android.app.Service
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.*
import java.util.*
import java.util.concurrent.ConcurrentHashMap

/**
 * BLE Connection Service
 * Manages Bluetooth Low Energy connections for mesh networking
 */
class BLEConnectionService : Service() {
    
    private val TAG = "BLEConnectionService"
    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // BLE components
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothLeScanner: BluetoothLeScanner? = null
    private var bluetoothLeAdvertiser: BluetoothLeAdvertiser? = null
    private var gattServer: BluetoothGattServer? = null
    
    // Connection tracking
    private val connectedDevices = ConcurrentHashMap<String, BluetoothGatt>()
    private val pendingConnections = ConcurrentHashMap<String, Long>()
    
    // Service UUID for mesh protocol
    private val MESH_SERVICE_UUID = UUID.fromString("0000ff00-0000-1000-8000-00805f9b34fb")
    private val TX_CHARACTERISTIC_UUID = UUID.fromString("0000ff01-0000-1000-8000-00805f9b34fb")
    private val RX_CHARACTERISTIC_UUID = UUID.fromString("0000ff02-0000-1000-8000-00805f9b34fb")
    
    // Scanning parameters
    private var isScanning = false
    private var scanCallback: ScanCallback? = null
    
    inner class LocalBinder : Binder() {
        fun getService(): BLEConnectionService = this@BLEConnectionService
    }
    
    override fun onBind(intent: Intent): IBinder {
        return binder
    }
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "BLE Connection Service created")
        initializeBluetooth()
        setupGattServer()
    }
    
    private fun initializeBluetooth() {
        val bluetoothManager = getSystemService(BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        bluetoothLeScanner = bluetoothAdapter?.bluetoothLeScanner
        bluetoothLeAdvertiser = bluetoothAdapter?.bluetoothLeAdvertiser
    }
    
    private fun setupGattServer() {
        val bluetoothManager = getSystemService(BLUETOOTH_SERVICE) as BluetoothManager
        
        gattServer = bluetoothManager.openGattServer(this, gattServerCallback)
        
        // Create mesh service
        val service = BluetoothGattService(
            MESH_SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )
        
        // TX characteristic (server to client)
        val txCharacteristic = BluetoothGattCharacteristic(
            TX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        
        // RX characteristic (client to server)
        val rxCharacteristic = BluetoothGattCharacteristic(
            RX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        service.addCharacteristic(txCharacteristic)
        service.addCharacteristic(rxCharacteristic)
        
        gattServer?.addService(service)
        Log.d(TAG, "GATT server setup complete")
    }
    
    fun startScanning() {
        if (isScanning) return
        
        val scanFilter = ScanFilter.Builder()
            .setServiceUuid(android.os.ParcelUuid(MESH_SERVICE_UUID))
            .build()
        
        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()
        
        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                handleScanResult(result)
            }
            
            override fun onBatchScanResults(results: List<ScanResult>) {
                results.forEach { handleScanResult(it) }
            }
            
            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "Scan failed with error code: $errorCode")
                isScanning = false
            }
        }
        
        bluetoothLeScanner?.startScan(listOf(scanFilter), scanSettings, scanCallback)
        isScanning = true
        Log.d(TAG, "BLE scanning started")
    }
    
    fun stopScanning() {
        if (!isScanning) return
        
        scanCallback?.let { bluetoothLeScanner?.stopScan(it) }
        isScanning = false
        Log.d(TAG, "BLE scanning stopped")
    }
    
    private fun handleScanResult(result: ScanResult) {
        val device = result.device
        val address = device.address
        
        // Avoid duplicate connections
        if (connectedDevices.containsKey(address) || pendingConnections.containsKey(address)) {
            return
        }
        
        // Connect to discovered device
        pendingConnections[address] = System.currentTimeMillis()
        device.connectGatt(this, false, gattClientCallback)
        Log.d(TAG, "Connecting to device: $address")
    }
    
    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Device connected: ${device.address}")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Device disconnected: ${device.address}")
                    connectedDevices.remove(device.address)
                }
            }
        }
        
        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            if (characteristic.uuid == RX_CHARACTERISTIC_UUID) {
                handleReceivedData(device, value)
                
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            }
        }
    }
    
    private val gattClientCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val address = gatt.device.address
            pendingConnections.remove(address)
            
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Connected to GATT server: $address")
                    connectedDevices[address] = gatt
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Disconnected from GATT server: $address")
                    connectedDevices.remove(address)
                    gatt.close()
                }
            }
        }
        
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Services discovered for ${gatt.device.address}")
                val service = gatt.getService(MESH_SERVICE_UUID)
                val txChar = service?.getCharacteristic(TX_CHARACTERISTIC_UUID)
                txChar?.let {
                    gatt.setCharacteristicNotification(it, true)
                }
            }
        }
        
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == TX_CHARACTERISTIC_UUID) {
                handleReceivedData(gatt.device, characteristic.value)
            }
        }
    }
    
    private fun handleReceivedData(device: BluetoothDevice, data: ByteArray) {
        Log.d(TAG, "Received ${data.size} bytes from ${device.address}")
    }
    
    fun sendData(deviceAddress: String, data: ByteArray): Boolean {
        val gatt = connectedDevices[deviceAddress] ?: return false
        val service = gatt.getService(MESH_SERVICE_UUID) ?: return false
        val rxChar = service.getCharacteristic(RX_CHARACTERISTIC_UUID) ?: return false
        
        rxChar.value = data
        return gatt.writeCharacteristic(rxChar)
    }
    
    fun getConnectedDeviceCount(): Int = connectedDevices.size
    
    override fun onDestroy() {
        super.onDestroy()
        stopScanning()
        connectedDevices.values.forEach { it.disconnect() }
        connectedDevices.clear()
        gattServer?.close()
        serviceScope.cancel()
        Log.d(TAG, "BLE Connection Service destroyed")
    }
}
