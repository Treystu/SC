package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.util.*
import java.util.concurrent.ConcurrentHashMap

class BLEGATTServer(private val context: Context) {
    private var gattServer: BluetoothGattServer? = null
    private val connectedDevices = Collections.newSetFromMap(ConcurrentHashMap<BluetoothDevice, Boolean>())
    
    companion object {
        private const val TAG = "BLEGATTServer"
        val MESH_SERVICE_UUID: UUID = UUID.fromString("00001820-0000-1000-8000-00805f9b34fb")
        val TX_CHAR_UUID: UUID = UUID.fromString("00001821-0000-1000-8000-00805f9b34fb")
        val RX_CHAR_UUID: UUID = UUID.fromString("00001822-0000-1000-8000-00805f9b34fb")
        val CLIENT_CONFIG_DESCRIPTOR: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
    }
    
    fun start() {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        
        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
        if (gattServer == null) {
            Log.e(TAG, "Unable to open GATT server")
            return
        }
        
        val service = BluetoothGattService(MESH_SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        
        val txChar = BluetoothGattCharacteristic(
            TX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        val txDescriptor = BluetoothGattDescriptor(
            CLIENT_CONFIG_DESCRIPTOR,
            BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
        txChar.addDescriptor(txDescriptor)
        
        val rxChar = BluetoothGattCharacteristic(
            RX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        service.addCharacteristic(txChar)
        service.addCharacteristic(rxChar)
        
        gattServer?.addService(service)
        Log.d(TAG, "GATT Server started")
    }
    
    fun sendData(device: BluetoothDevice, data: ByteArray) {
        val service = gattServer?.getService(MESH_SERVICE_UUID) ?: return
        val characteristic = service.getCharacteristic(TX_CHAR_UUID)
        characteristic.value = data
        
        // Check if device is connected and notifications are enabled (simplified check)
        if (connectedDevices.contains(device)) {
            gattServer?.notifyCharacteristicChanged(device, characteristic, false)
        }
    }
    
    fun broadcastData(data: ByteArray) {
        val service = gattServer?.getService(MESH_SERVICE_UUID) ?: return
        val characteristic = service.getCharacteristic(TX_CHAR_UUID)
        characteristic.value = data
        
        for (device in connectedDevices) {
            gattServer?.notifyCharacteristicChanged(device, characteristic, false)
        }
    }
    
    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                when (newState) {
                    BluetoothProfile.STATE_CONNECTED -> {
                        Log.d(TAG, "Device connected: ${device.address}")
                        connectedDevices.add(device)
                    }
                    BluetoothProfile.STATE_DISCONNECTED -> {
                        Log.d(TAG, "Device disconnected: ${device.address}")
                        connectedDevices.remove(device)
                    }
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
            if (characteristic.uuid == RX_CHAR_UUID) {
                Log.d(TAG, "Received ${value.size} bytes from ${device.address}")
                handleReceivedData(device, value)
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            } else {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
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
            if (descriptor.uuid == CLIENT_CONFIG_DESCRIPTOR) {
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            }
        }
    }
    
    private fun handleReceivedData(device: BluetoothDevice, data: ByteArray) {
        // Process received mesh data
        // In a real app, this would forward to a mesh manager
    }
    
    fun stop() {
        gattServer?.clearServices()
        gattServer?.close()
        gattServer = null
        connectedDevices.clear()
        Log.d(TAG, "GATT Server stopped")
    }
}
