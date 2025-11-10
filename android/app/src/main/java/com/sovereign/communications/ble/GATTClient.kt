package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log

class MeshGATTClient(private val context: Context) {
    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null

    companion object {
        private const val TAG = "MeshGATTClient"
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.d(TAG, "Connected to GATT server")
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.d(TAG, "Disconnected from GATT server")
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(MeshGATTServer.SERVICE_UUID)
                txCharacteristic = service?.getCharacteristic(MeshGATTServer.TX_CHAR_UUID)
                rxCharacteristic = service?.getCharacteristic(MeshGATTServer.RX_CHAR_UUID)
                
                // Enable notifications on TX characteristic
                txCharacteristic?.let {
                    gatt.setCharacteristicNotification(it, true)
                }
                
                Log.d(TAG, "Services discovered and configured")
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (characteristic.uuid == MeshGATTServer.TX_CHAR_UUID) {
                val data = characteristic.value
                Log.d(TAG, "Received notification: ${data.size} bytes")
                handleReceivedMessage(data)
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Write successful")
            }
        }
    }

    fun connect(device: BluetoothDevice) {
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
    }

    fun sendMessage(data: ByteArray) {
        rxCharacteristic?.let { char ->
            char.value = data
            bluetoothGatt?.writeCharacteristic(char)
        }
    }

    private fun handleReceivedMessage(data: ByteArray) {
        // Process received message
    }
}
