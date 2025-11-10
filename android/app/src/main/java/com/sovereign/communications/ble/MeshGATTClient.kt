package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.util.UUID

class MeshGATTClient(private val context: Context) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private var bluetoothGatt: BluetoothGatt? = null
    private var messageCallback: ((ByteArray) -> Unit)? = null
    private var isConnected = false

    companion object {
        private const val TAG = "MeshGATTClient"
        val MESH_SERVICE_UUID: UUID = UUID.fromString("00001234-0000-1000-8000-00805f9b34fb")
        val TX_CHARACTERISTIC_UUID: UUID = UUID.fromString("00001235-0000-1000-8000-00805f9b34fb")
        val RX_CHARACTERISTIC_UUID: UUID = UUID.fromString("00001236-0000-1000-8000-00805f9b34fb")
    }

    fun connect(device: BluetoothDevice, onMessageReceived: (ByteArray) -> Unit) {
        messageCallback = onMessageReceived
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        isConnected = false
    }

    fun sendMessage(message: ByteArray): Boolean {
        if (!isConnected) {
            Log.w(TAG, "Not connected, cannot send message")
            return false
        }

        val service = bluetoothGatt?.getService(MESH_SERVICE_UUID) ?: return false
        val characteristic = service.getCharacteristic(RX_CHARACTERISTIC_UUID) ?: return false

        characteristic.value = message
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

        return bluetoothGatt?.writeCharacteristic(characteristic) ?: false
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.i(TAG, "Connected to GATT server")
                    isConnected = true
                    gatt?.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.i(TAG, "Disconnected from GATT server")
                    isConnected = false
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i(TAG, "Services discovered")
                
                // Enable notifications for TX characteristic
                val service = gatt?.getService(MESH_SERVICE_UUID)
                val txCharacteristic = service?.getCharacteristic(TX_CHARACTERISTIC_UUID)
                
                if (txCharacteristic != null) {
                    gatt.setCharacteristicNotification(txCharacteristic, true)
                    
                    // Write to CCC descriptor to enable notifications
                    val descriptor = txCharacteristic.getDescriptor(
                        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
                    )
                    descriptor?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(descriptor)
                }
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?
        ) {
            if (characteristic?.uuid == TX_CHARACTERISTIC_UUID) {
                val value = characteristic.value
                if (value != null) {
                    Log.d(TAG, "Received notification: ${value.size} bytes")
                    messageCallback?.invoke(value)
                }
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Message sent successfully")
            } else {
                Log.e(TAG, "Failed to send message, status: $status")
            }
        }
    }

    fun isConnected() = isConnected
}
