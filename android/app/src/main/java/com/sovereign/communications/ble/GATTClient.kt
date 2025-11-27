package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.UUID

interface MeshGATTClientCallback {
    fun onConnected(device: BluetoothDevice)
    fun onDisconnected(device: BluetoothDevice)
    fun onMessageReceived(data: ByteArray)
    fun onConnectionFailed(device: BluetoothDevice)
}

class MeshGATTClient(private val context: Context, private val callback: MeshGATTClientCallback) {
    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private var targetDevice: BluetoothDevice? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    
    companion object {
        private const val TAG = "MeshGATTClient"
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> {
                        Log.d(TAG, "Connected to GATT server")
                        gatt.discoverServices()
                    }
                    BluetoothProfile.STATE_DISCONNECTED -> {
                        Log.d(TAG, "Disconnected from GATT server")
                        mainHandler.post { callback.onDisconnected(gatt.device) }
                        close()
                    }
                }
            } else {
                Log.e(TAG, "Connection failed with status: $status")
                mainHandler.post { callback.onConnectionFailed(gatt.device) }
                close()
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(MeshGATTServer.SERVICE_UUID)
                if (service == null) {
                    Log.e(TAG, "Service not found")
                    disconnect()
                    return
                }
                
                txCharacteristic = service.getCharacteristic(MeshGATTServer.TX_CHAR_UUID)
                rxCharacteristic = service.getCharacteristic(MeshGATTServer.RX_CHAR_UUID)
                
                if (txCharacteristic == null || rxCharacteristic == null) {
                    Log.e(TAG, "Characteristics not found")
                    disconnect()
                    return
                }
                
                // Enable notifications on TX characteristic
                gatt.setCharacteristicNotification(txCharacteristic, true)
                val descriptor = txCharacteristic?.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
                if (descriptor != null) {
                    descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(descriptor)
                }
                
                Log.d(TAG, "Services discovered and configured")
                mainHandler.post { callback.onConnected(gatt.device) }
            } else {
                Log.e(TAG, "Service discovery failed: $status")
                disconnect()
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            if (characteristic.uuid == MeshGATTServer.TX_CHAR_UUID) {
                val data = characteristic.value
                Log.d(TAG, "Received notification: ${data.size} bytes")
                mainHandler.post { callback.onMessageReceived(data) }
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Write successful")
            } else {
                Log.e(TAG, "Write failed: $status")
            }
        }
    }

    fun connect(device: BluetoothDevice) {
        targetDevice = device
        bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
    }
    
    private fun close() {
        bluetoothGatt?.close()
        bluetoothGatt = null
        txCharacteristic = null
        rxCharacteristic = null
    }

    fun sendMessage(data: ByteArray): Boolean {
        if (bluetoothGatt == null || rxCharacteristic == null) {
            Log.e(TAG, "Not connected")
            return false
        }
        
        rxCharacteristic?.value = data
        rxCharacteristic?.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
        return bluetoothGatt?.writeCharacteristic(rxCharacteristic) ?: false
    }
}
