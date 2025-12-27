package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * BLE GATT Server for advertising mesh services
 */
class BLEGATTServer(
    private val context: Context
) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter = bluetoothManager.adapter
    private var bluetoothGattServer: BluetoothGattServer? = null
    private val connectedDevices = mutableSetOf<BluetoothDevice>()
    private var messageCallback: ((ByteArray) -> Unit)? = null

    companion object {
        private const val TAG = "BLEGATTServer"
    }

    /**
     * Start the GATT server
     */
    fun start(onMessageReceived: (ByteArray) -> Unit): Flow<BluetoothDevice> = callbackFlow {
        messageCallback = onMessageReceived

        bluetoothGattServer = bluetoothManager.openGattServer(context, gattServerCallback)

        // Add mesh service
        val meshService = BluetoothGattService(
            MeshGATTServer.MESH_SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        // TX Characteristic (notifications to clients)
        val txCharacteristic = BluetoothGattCharacteristic(
            MeshGATTServer.TX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        txCharacteristic.addDescriptor(
            BluetoothGattDescriptor(
                MeshGATTServer.CCC_DESCRIPTOR_UUID,
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
        )
        meshService.addCharacteristic(txCharacteristic)

        // RX Characteristic (writes from clients)
        val rxCharacteristic = BluetoothGattCharacteristic(
            MeshGATTServer.RX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        meshService.addCharacteristic(rxCharacteristic)

        // Version Characteristic
        val versionCharacteristic = BluetoothGattCharacteristic(
            MeshGATTServer.VERSION_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        versionCharacteristic.value = byteArrayOf(
            (MeshGATTServer.SERVICE_VERSION_1_0).toByte(),
            (MeshGATTServer.SERVICE_VERSION_1_0 shr 8).toByte()
        )
        meshService.addCharacteristic(versionCharacteristic)

        bluetoothGattServer?.addService(meshService)

        awaitClose {
            stop()
        }
    }

    /**
     * Stop the GATT server
     */
    fun stop() {
        bluetoothGattServer?.close()
        bluetoothGattServer = null
        connectedDevices.clear()
    }

    /**
     * Send a message to all connected devices
     */
    fun broadcastMessage(message: ByteArray): Boolean {
        if (bluetoothGattServer == null) return false

        val service = bluetoothGattServer?.getService(MeshGATTServer.MESH_SERVICE_UUID) ?: return false
        val txCharacteristic = service.getCharacteristic(MeshGATTServer.TX_CHARACTERISTIC_UUID) ?: return false

        txCharacteristic.value = message

        var success = true
        for (device in connectedDevices) {
            if (!bluetoothGattServer!!.notifyCharacteristicChanged(device, txCharacteristic, false)) {
                success = false
            }
        }

        return success
    }

    /**
     * Send a message to a specific device
     */
    fun sendMessage(device: BluetoothDevice, message: ByteArray): Boolean {
        if (bluetoothGattServer == null || !connectedDevices.contains(device)) return false

        val service = bluetoothGattServer?.getService(MeshGATTServer.MESH_SERVICE_UUID) ?: return false
        val txCharacteristic = service.getCharacteristic(MeshGATTServer.TX_CHARACTERISTIC_UUID) ?: return false

        txCharacteristic.value = message

        return bluetoothGattServer!!.notifyCharacteristicChanged(device, txCharacteristic, false)
    }

    /**
     * Get connected devices count
     */
    fun getConnectedDevicesCount(): Int = connectedDevices.size

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Device connected: ${device.address}")
                    connectedDevices.add(device)
                    trySend(device)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Device disconnected: ${device.address}")
                    connectedDevices.remove(device)
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
            if (characteristic.uuid == MeshGATTServer.RX_CHARACTERISTIC_UUID) {
                Log.d(TAG, "Received message from ${device.address}: ${value.size} bytes")
                messageCallback?.invoke(value)

                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            if (descriptor.uuid == MeshGATTServer.CCC_DESCRIPTOR_UUID) {
                Log.d(TAG, "CCC descriptor written by ${device.address}")
                if (responseNeeded) {
                    bluetoothGattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
            }
        }
    }
}