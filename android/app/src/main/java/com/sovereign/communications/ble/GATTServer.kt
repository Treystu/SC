package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

interface MeshGATTServerCallback {
    fun onDeviceConnected(device: BluetoothDevice)
    fun onDeviceDisconnected(device: BluetoothDevice)
    fun onMessageReceived(device: BluetoothDevice, data: ByteArray)
}

class MeshGATTServer(private val context: Context, private val callback: MeshGATTServerCallback) {
    private var bluetoothManager: BluetoothManager? = null
    private var gattServer: BluetoothGattServer? = null
    private val connectedDevices = mutableSetOf<BluetoothDevice>()
    private val outgoingQueue = ConcurrentLinkedQueue<ByteArray>()
    
    companion object {
        private const val TAG = "MeshGATTServer"
        val SERVICE_UUID: UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
        val TX_CHAR_UUID: UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
        val RX_CHAR_UUID: UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            super.onConnectionStateChange(device, status, newState)
            if (status == BluetoothGatt.GATT_SUCCESS) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.d(TAG, "Device connected: ${device.address}")
                    connectedDevices.add(device)
                    callback.onDeviceConnected(device)
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.d(TAG, "Device disconnected: ${device.address}")
                    connectedDevices.remove(device)
                    callback.onDeviceDisconnected(device)
                }
            } else {
                Log.e(TAG, "Connection state change error: $status")
                connectedDevices.remove(device)
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
            super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)
            
            if (characteristic.uuid == RX_CHAR_UUID) {
                Log.d(TAG, "Received message part: ${value.size} bytes from ${device.address}")
                
                // In a real implementation, we would handle fragmentation here.
                // For now, we assume small messages or handle them directly.
                callback.onMessageReceived(device, value)
                
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            } else {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
                }
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic
        ) {
            super.onCharacteristicReadRequest(device, requestId, offset, characteristic)
            
            if (characteristic.uuid == TX_CHAR_UUID) {
                val response = outgoingQueue.poll() ?: ByteArray(0)
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, response)
            } else {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
            }
        }
        
        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            super.onNotificationSent(device, status)
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.e(TAG, "Notification failed to send to ${device.address}")
            }
        }
    }

    fun start(): Boolean {
        bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        if (bluetoothManager == null) {
            Log.e(TAG, "BluetoothManager not available")
            return false
        }
        
        gattServer = bluetoothManager?.openGattServer(context, gattServerCallback)
        if (gattServer == null) {
            Log.e(TAG, "Unable to open GATT server")
            return false
        }
        
        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        
        val txCharacteristic = BluetoothGattCharacteristic(
            TX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        
        val rxCharacteristic = BluetoothGattCharacteristic(
            RX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        service.addCharacteristic(txCharacteristic)
        service.addCharacteristic(rxCharacteristic)
        
        val result = gattServer?.addService(service) ?: false
        Log.d(TAG, "GATT Server started: $result")
        return result
    }

    fun stop() {
        gattServer?.clearServices()
        gattServer?.close()
        gattServer = null
        connectedDevices.clear()
        Log.d(TAG, "GATT Server stopped")
    }

    fun broadcastMessage(data: ByteArray) {
        val service = gattServer?.getService(SERVICE_UUID)
        val characteristic = service?.getCharacteristic(TX_CHAR_UUID)
        
        if (characteristic != null) {
            characteristic.value = data
            for (device in connectedDevices) {
                gattServer?.notifyCharacteristicChanged(device, characteristic, false)
            }
        }
    }
    
    fun sendToDevice(device: BluetoothDevice, data: ByteArray) {
        if (!connectedDevices.contains(device)) return
        
        val service = gattServer?.getService(SERVICE_UUID)
        val characteristic = service?.getCharacteristic(TX_CHAR_UUID)
        
        if (characteristic != null) {
            characteristic.value = data
            gattServer?.notifyCharacteristicChanged(device, characteristic, false)
        }
    }
}
