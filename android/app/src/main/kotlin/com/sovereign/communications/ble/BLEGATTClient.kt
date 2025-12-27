package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * BLE GATT Client for connecting to mesh peers
 */
class BLEGATTClient(
    private val context: Context
) {
    private var bluetoothGatt: BluetoothGatt? = null
    private var messageCallback: ((ByteArray) -> Unit)? = null
    private var connectionCallback: ((Boolean) -> Unit)? = null
    private var isConnected = false

    companion object {
        private const val TAG = "BLEGATTClient"
    }

    /**
     * Connect to a BLE device
     */
    fun connect(device: BluetoothDevice, onMessageReceived: (ByteArray) -> Unit, onConnectionChanged: (Boolean) -> Unit): Flow<Boolean> = callbackFlow {
        messageCallback = onMessageReceived
        connectionCallback = onConnectionChanged

        bluetoothGatt = device.connectGatt(context, false, gattCallback)

        awaitClose {
            disconnect()
        }
    }

    /**
     * Disconnect from the current device
     */
    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        isConnected = false
        connectionCallback?.invoke(false)
    }

    /**
     * Send a message to the connected device
     */
    fun sendMessage(message: ByteArray): Boolean {
        if (!isConnected || bluetoothGatt == null) {
            Log.w(TAG, "Not connected, cannot send message")
            return false
        }

        val service = bluetoothGatt?.getService(MeshGATTServer.MESH_SERVICE_UUID) ?: return false
        val characteristic = service.getCharacteristic(MeshGATTServer.RX_CHARACTERISTIC_UUID) ?: return false

        characteristic.value = message
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

        return bluetoothGatt?.writeCharacteristic(characteristic) ?: false
    }

    /**
     * Check if currently connected
     */
    fun isConnected(): Boolean = isConnected

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Connected to GATT server")
                    isConnected = true
                    connectionCallback?.invoke(true)
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Disconnected from GATT server")
                    isConnected = false
                    connectionCallback?.invoke(false)
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Services discovered")
                // Enable notifications for RX characteristic
                val service = gatt.getService(MeshGATTServer.MESH_SERVICE_UUID)
                val rxCharacteristic = service?.getCharacteristic(MeshGATTServer.RX_CHARACTERISTIC_UUID)
                if (rxCharacteristic != null) {
                    gatt.setCharacteristicNotification(rxCharacteristic, true)
                    // Write CCC descriptor to enable notifications
                    val descriptor = rxCharacteristic.getDescriptor(MeshGATTServer.CCC_DESCRIPTOR_UUID)
                    descriptor?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(descriptor)
                }
            }
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == MeshGATTServer.TX_CHARACTERISTIC_UUID) {
                val message = characteristic.value
                if (message != null) {
                    Log.d(TAG, "Received message via BLE: ${message.size} bytes")
                    messageCallback?.invoke(message)
                }
            }
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.e(TAG, "Failed to write characteristic: $status")
            }
        }
    }
}