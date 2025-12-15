package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.util.UUID

class MeshGATTClient(
    private val context: Context,
) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private var bluetoothGatt: BluetoothGatt? = null
    internal var messageCallback: ((ByteArray) -> Unit)? = null
    internal var connected = false

    companion object {
        private const val TAG = "MeshGATTClient"
    }

    fun connect(
        device: BluetoothDevice,
        onMessageReceived: (ByteArray) -> Unit,
    ) {
        messageCallback = onMessageReceived
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        connected = false
    }

    fun sendMessage(message: ByteArray): Boolean {
        if (!connected) {
            Log.w(TAG, "Not connected, cannot send message")
            return false
        }

        val service = bluetoothGatt?.getService(MeshGATTServer.MESH_SERVICE_UUID) ?: return false
        val characteristic = service.getCharacteristic(MeshGATTServer.RX_CHARACTERISTIC_UUID) ?: return false

        characteristic.value = message
        characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT

        return bluetoothGatt?.writeCharacteristic(characteristic) ?: false
    }

    private val gattCallback: GattCallback by lazy { GattCallback() }

    private inner class GattCallback : BluetoothGattCallback() {
        override fun onConnectionStateChange(
            gatt: BluetoothGatt?,
            status: Int,
            newState: Int,
        ) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.i(TAG, "Connected to GATT server")
                    this@MeshGATTClient.connected = true
                    gatt?.discoverServices()
                }

                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.i(TAG, "Disconnected from GATT server")
                    this@MeshGATTClient.connected = false
                }
            }
        }

        override fun onServicesDiscovered(
            gatt: BluetoothGatt?,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i(TAG, "Services discovered")

                // Enable notifications for TX characteristic
                val service = gatt?.getService(MeshGATTServer.MESH_SERVICE_UUID)
                val txCharacteristic = service?.getCharacteristic(MeshGATTServer.TX_CHARACTERISTIC_UUID)

                if (txCharacteristic != null) {
                    gatt.setCharacteristicNotification(txCharacteristic, true)

                    // Write to CCC descriptor to enable notifications
                    val descriptor =
                        txCharacteristic.getDescriptor(
                            MeshGATTServer.CCC_DESCRIPTOR_UUID,
                        )
                    descriptor?.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(descriptor)
                }
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?,
        ) {
            if (characteristic?.uuid == MeshGATTServer.TX_CHARACTERISTIC_UUID) {
                val value = characteristic.value
                if (value != null) {
                    Log.d(TAG, "Received notification: ${value.size} bytes")
                    val callback = this@MeshGATTClient.messageCallback
                    callback?.invoke(value)
                }
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Message sent successfully")
            } else {
                Log.e(TAG, "Failed to send message, status: $status")
            }
        }
    }

    fun isConnected() = connected
}
