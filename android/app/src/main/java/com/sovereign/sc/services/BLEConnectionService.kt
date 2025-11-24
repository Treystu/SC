package com.sovereign.sc.services

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
 * BLE Connection Service - Manages Bluetooth Low Energy connections for mesh networking
 * Task 223: BLE connection service with GATT management
 */
class BLEConnectionService : Service() {
    private val TAG = "BLEConnectionService"
    private val binder = LocalBinder()
    
    private lateinit var bluetoothManager: BluetoothManager
    private lateinit var bluetoothAdapter: BluetoothAdapter
    private lateinit var bluetoothLeScanner: BluetoothLeScanner
    private lateinit var bluetoothLeAdvertiser: BluetoothLeAdvertiser
    
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    // Connected GATT servers (peripheral connections)
    private val gattServers = ConcurrentHashMap<String, BluetoothGattServer>()
    
    // Connected GATT clients (central connections)
    private val gattClients = ConcurrentHashMap<String, BluetoothGatt>()
    
    // Service UUID for mesh protocol
    private val MESH_SERVICE_UUID = UUID.fromString("0000FE40-CC7A-482A-984A-7F2ED5B3E58F")
    private val TX_CHARACTERISTIC_UUID = UUID.fromString("0000FE41-8E22-4541-9D4C-21EDAE82ED19")
    private val RX_CHARACTERISTIC_UUID = UUID.fromString("0000FE42-8E22-4541-9D4C-21EDAE82ED19")
    
    private var isScanning = false
    private var isAdvertising = false
    
    inner class LocalBinder : Binder() {
        fun getService(): BLEConnectionService = this@BLEConnectionService
    }
    
    override fun onBind(intent: Intent?): IBinder {
        return binder
    }
    
    override fun onCreate() {
        super.onCreate()
        initializeBluetooth()
    }
    
    private fun initializeBluetooth() {
        bluetoothManager = getSystemService(BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        
        if (bluetoothAdapter.isEnabled) {
            bluetoothLeScanner = bluetoothAdapter.bluetoothLeScanner
            bluetoothLeAdvertiser = bluetoothAdapter.bluetoothLeAdvertiser
            Log.d(TAG, "Bluetooth initialized successfully")
        } else {
            Log.e(TAG, "Bluetooth is not enabled")
        }
    }
    
    /**
     * Start scanning for BLE mesh peers
     */
    fun startScanning() {
        if (isScanning) return
        
        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .build()
        
        val scanFilter = ScanFilter.Builder()
            .setServiceUuid(android.os.ParcelUuid(MESH_SERVICE_UUID))
            .build()
        
        try {
            bluetoothLeScanner.startScan(listOf(scanFilter), scanSettings, scanCallback)
            isScanning = true
            Log.d(TAG, "Started BLE scanning")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start scanning", e)
        }
    }
    
    /**
     * Stop scanning for BLE peers
     */
    fun stopScanning() {
        if (!isScanning) return
        
        try {
            bluetoothLeScanner.stopScan(scanCallback)
            isScanning = false
            Log.d(TAG, "Stopped BLE scanning")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop scanning", e)
        }
    }
    
    /**
     * Start advertising as a BLE peripheral
     */
    fun startAdvertising() {
        if (isAdvertising) return
        
        val advertiseSettings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .build()
        
        val advertiseData = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(android.os.ParcelUuid(MESH_SERVICE_UUID))
            .build()
        
        try {
            bluetoothLeAdvertiser.startAdvertising(advertiseSettings, advertiseData, advertiseCallback)
            isAdvertising = true
            Log.d(TAG, "Started BLE advertising")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start advertising", e)
        }
    }
    
    /**
     * Stop advertising
     */
    fun stopAdvertising() {
        if (!isAdvertising) return
        
        try {
            bluetoothLeAdvertiser.stopAdvertising(advertiseCallback)
            isAdvertising = false
            Log.d(TAG, "Stopped BLE advertising")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop advertising", e)
        }
    }
    
    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            Log.d(TAG, "Discovered device: ${device.address}")
            
            // Connect to discovered peer
            connectToDevice(device)
        }
        
        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "Scan failed with error: $errorCode")
            isScanning = false
        }
    }
    
    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "Advertising started successfully")
        }
        
        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Advertising failed with error: $errorCode")
            isAdvertising = false
        }
    }
    
    /**
     * Connect to a discovered BLE device
     */
    private fun connectToDevice(device: BluetoothDevice) {
        if (gattClients.containsKey(device.address)) {
            Log.d(TAG, "Already connected to ${device.address}")
            return
        }
        
        val gatt = device.connectGatt(this, false, gattCallback)
        gattClients[device.address] = gatt
    }
    
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Connected to GATT server: ${gatt.device.address}")
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Disconnected from GATT server: ${gatt.device.address}")
                    gattClients.remove(gatt.device.address)
                    gatt.close()
                }
            }
        }
        
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(MESH_SERVICE_UUID)
                service?.let {
                    // Enable notifications on RX characteristic
                    val rxChar = it.getCharacteristic(RX_CHARACTERISTIC_UUID)
                    rxChar?.let { char ->
                        gatt.setCharacteristicNotification(char, true)
                        
                        val descriptor = char.getDescriptor(
                            UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
                        )
                        descriptor?.let { desc ->
                            desc.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                            gatt.writeDescriptor(desc)
                        }
                    }
                }
            }
        }
        
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == RX_CHARACTERISTIC_UUID) {
                val data = characteristic.value
                handleReceivedData(gatt.device.address, data)
            }
        }
    }
    
    /**
     * Send data to a connected peer
     */
    fun sendData(deviceAddress: String, data: ByteArray): Boolean {
        val gatt = gattClients[deviceAddress] ?: return false
        val service = gatt.getService(MESH_SERVICE_UUID) ?: return false
        val txChar = service.getCharacteristic(TX_CHARACTERISTIC_UUID) ?: return false
        
        txChar.value = data
        return gatt.writeCharacteristic(txChar)
    }
    
    /**
     * Handle received data from peer
     */
    private fun handleReceivedData(deviceAddress: String, data: ByteArray) {
        Log.d(TAG, "Received ${data.size} bytes from $deviceAddress")
        // Process received mesh protocol data
        serviceScope.launch {
            processMeshData(deviceAddress, data)
        }
    }
    
    private suspend fun processMeshData(deviceAddress: String, data: ByteArray) {
        // TODO: Forward to mesh network handler
        Log.d(TAG, "Processing mesh data from $deviceAddress")
    }
    
    /**
     * Get list of connected peers
     */
    fun getConnectedPeers(): List<String> {
        return gattClients.keys.toList()
    }
    
    /**
     * Disconnect from a specific peer
     */
    fun disconnectPeer(deviceAddress: String) {
        gattClients[deviceAddress]?.let { gatt ->
            gatt.disconnect()
            gatt.close()
            gattClients.remove(deviceAddress)
        }
    }
    
    /**
     * Disconnect from all peers
     */
    fun disconnectAll() {
        gattClients.values.forEach { gatt ->
            gatt.disconnect()
            gatt.close()
        }
        gattClients.clear()
    }
    
    override fun onDestroy() {
        super.onDestroy()
        stopScanning()
        stopAdvertising()
        disconnectAll()
        serviceScope.cancel()
        Log.d(TAG, "BLE Connection Service destroyed")
    }
}
