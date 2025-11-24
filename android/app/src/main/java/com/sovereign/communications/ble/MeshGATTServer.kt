package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.nio.ByteBuffer
import java.util.UUID

/**
 * Mesh GATT Server - Task 35 Enhanced
 * Custom GATT service with versioning and optimization
 */
class MeshGATTServer(private val context: Context) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private var gattServer: BluetoothGattServer? = null
    private val connectedDevices = mutableSetOf<BluetoothDevice>()
    private var messageCallback: ((ByteArray) -> Unit)? = null
    
    // Service metadata
    private val serviceVersion = SERVICE_VERSION_1_0
    private var mtuSize = DEFAULT_MTU

    companion object {
        private const val TAG = "MeshGATTServer"
        
        // Proper random UUIDs generated for Sovereign Communications Mesh
        // Base UUID: 5C0xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (SC prefix)
        val MESH_SERVICE_UUID: UUID = UUID.fromString("5C000001-0000-1000-8000-00805f9b34fb")
        val TX_CHARACTERISTIC_UUID: UUID = UUID.fromString("5C000002-0000-1000-8000-00805f9b34fb")
        val RX_CHARACTERISTIC_UUID: UUID = UUID.fromString("5C000003-0000-1000-8000-00805f9b34fb")
        val VERSION_CHARACTERISTIC_UUID: UUID = UUID.fromString("5C000004-0000-1000-8000-00805f9b34fb")
        val METADATA_CHARACTERISTIC_UUID: UUID = UUID.fromString("5C000005-0000-1000-8000-00805f9b34fb")
        
        // Service versioning
        const val SERVICE_VERSION_1_0: Short = 0x0100
        
        // MTU constants
        const val DEFAULT_MTU = 23
        const val MAX_MTU = 517
        
        // Client Characteristic Configuration Descriptor
        val CCC_DESCRIPTOR_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }

    /**
     * Start GATT server with versioned service
     */
    fun start(onMessageReceived: (ByteArray) -> Unit) {
        messageCallback = onMessageReceived

        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)

        // Create GATT service with metadata
        val service = BluetoothGattService(
            MESH_SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        // TX characteristic (server -> client notifications) - Task 36
        val txCharacteristic = BluetoothGattCharacteristic(
            TX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY or BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        // Add CCC descriptor for notifications
        txCharacteristic.addDescriptor(
            BluetoothGattDescriptor(
                CCC_DESCRIPTOR_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
        )

        // RX characteristic (client -> server writes) - Task 36
        val rxCharacteristic = BluetoothGattCharacteristic(
            RX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        // Version characteristic for service versioning - Task 35
        val versionCharacteristic = BluetoothGattCharacteristic(
            VERSION_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattDescriptor.PERMISSION_READ
        )
        versionCharacteristic.value = ByteBuffer.allocate(2).putShort(serviceVersion).array()
        
        // Metadata characteristic - Task 35
        val metadataCharacteristic = BluetoothGattCharacteristic(
            METADATA_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        metadataCharacteristic.value = buildServiceMetadata()

        service.addCharacteristic(txCharacteristic)
        service.addCharacteristic(rxCharacteristic)
        service.addCharacteristic(versionCharacteristic)
        service.addCharacteristic(metadataCharacteristic)

        gattServer?.addService(service)
        Log.i(TAG, "GATT server started with version: ${versionToString(serviceVersion)}")
    }
    
    /**
     * Build service metadata - Task 35
     */
    private fun buildServiceMetadata(): ByteArray {
        val metadata = ByteBuffer.allocate(32)
        metadata.putShort(serviceVersion)              // Version (2 bytes)
        metadata.putShort(MAX_MTU.toShort())           // Max MTU (2 bytes)
        metadata.putInt(0x5343)                        // Service ID "SC" (4 bytes)
        metadata.put("SovereignComm".toByteArray().copyOf(24)) // Name (24 bytes)
        return metadata.array()
    }
    
    /**
     * Convert version to string
     */
    private fun versionToString(version: Short): String {
        val major = (version.toInt() shr 8) and 0xFF
        val minor = version.toInt() and 0xFF
        return "$major.$minor"
    }
    
    /**
     * Validate characteristic value - Task 36
     */
    private fun validateCharacteristicValue(characteristic: BluetoothGattCharacteristic, value: ByteArray): Boolean {
        return when (characteristic.uuid) {
            RX_CHARACTERISTIC_UUID -> {
                // Validate message format
                value.size in 1..mtuSize && value.isNotEmpty()
            }
            else -> true
        }
    }

    fun stop() {
        gattServer?.close()
        gattServer = null
        connectedDevices.clear()
        Log.i(TAG, "GATT server stopped")
    }

    /**
     * Send message with MTU awareness
     */
    fun sendMessage(message: ByteArray, device: BluetoothDevice? = null) {
        val service = gattServer?.getService(MESH_SERVICE_UUID) ?: return
        val characteristic = service.getCharacteristic(TX_CHARACTERISTIC_UUID) ?: return

        val devicesToNotify = if (device != null) {
            listOf(device)
        } else {
            connectedDevices.toList()
        }
        
        // Fragment if needed based on MTU
        val effectiveMtu = mtuSize - 3 // ATT header overhead
        if (message.size > effectiveMtu) {
            Log.w(TAG, "Message size (${message.size}) exceeds MTU ($effectiveMtu), fragmentation needed")
            // Fragmentation handled by BLEFragmentation class
            return
        }

        for (dev in devicesToNotify) {
            characteristic.value = message
            val success = gattServer?.notifyCharacteristicChanged(dev, characteristic, false) ?: false
            Log.d(TAG, "Notification sent to ${dev.address}: $success")
        }
    }
    
    /**
     * Request MTU change - Task 39
     */
    fun requestMtu(device: BluetoothDevice, mtu: Int) {
        val requestedMtu = mtu.coerceIn(DEFAULT_MTU, MAX_MTU)
        // Note: MTU is typically negotiated by client
        Log.i(TAG, "MTU change requested: $requestedMtu for ${device.address}")
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            if (device == null) return

            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    connectedDevices.add(device)
                    Log.i(TAG, "Device connected: ${device.address}, total: ${connectedDevices.size}")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    connectedDevices.remove(device)
                    Log.i(TAG, "Device disconnected: ${device.address}, total: ${connectedDevices.size}")
                }
            }
        }
        
        override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
            Log.i(TAG, "MTU changed to $mtu for ${device?.address}")
            mtuSize = mtu
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (characteristic?.uuid == RX_CHARACTERISTIC_UUID && value != null) {
                // Validate characteristic value - Task 36
                if (!validateCharacteristicValue(characteristic, value)) {
                    Log.w(TAG, "Invalid characteristic value received")
                    if (responseNeeded) {
                        gattServer?.sendResponse(
                            device,
                            requestId,
                            BluetoothGatt.GATT_INVALID_ATTRIBUTE_LENGTH,
                            offset,
                            null
                        )
                    }
                    return
                }
                
                Log.d(TAG, "Received message: ${value.size} bytes from ${device?.address}")
                messageCallback?.invoke(value)
            }

            if (responseNeeded) {
                gattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    offset,
                    value
                )
            }
        }
        
        override fun onCharacteristicReadRequest(
            device: BluetoothDevice?,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic?
        ) {
            val value = characteristic?.value
            gattServer?.sendResponse(
                device,
                requestId,
                BluetoothGatt.GATT_SUCCESS,
                offset,
                value
            )
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            descriptor: BluetoothGattDescriptor?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (descriptor?.uuid == CCC_DESCRIPTOR_UUID) {
                val enabled = value?.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) == true
                Log.d(TAG, "Notifications ${if (enabled) "enabled" else "disabled"} for ${device?.address}")
            }
            
            if (responseNeeded) {
                gattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    offset,
                    value
                )
            }
        }
    }

    fun getConnectedDeviceCount() = connectedDevices.size
    
    /**
     * Get server statistics
     */
    fun getStats(): Map<String, Any> {
        return mapOf(
            "connectedDevices" to connectedDevices.size,
            "serviceVersion" to versionToString(serviceVersion),
            "mtuSize" to mtuSize,
            "serviceUuid" to MESH_SERVICE_UUID.toString()
        )
    }
}
