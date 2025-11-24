package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import java.util.*

class BLEGATTServer(private val context: Context) {
    private var gattServer: BluetoothGattServer? = null
    private val connectedDevices = mutableSetOf<BluetoothDevice>()
    
    companion object {
        val MESH_SERVICE_UUID: UUID = UUID.fromString("00001820-0000-1000-8000-00805f9b34fb")
        val TX_CHAR_UUID: UUID = UUID.fromString("00001821-0000-1000-8000-00805f9b34fb")
        val RX_CHAR_UUID: UUID = UUID.fromString("00001822-0000-1000-8000-00805f9b34fb")
    }
    
    fun start() {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        
        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)
        
        val service = BluetoothGattService(MESH_SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        
        val txChar = BluetoothGattCharacteristic(
            TX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        
        val rxChar = BluetoothGattCharacteristic(
            RX_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )
        
        service.addCharacteristic(txChar)
        service.addCharacteristic(rxChar)
        
        gattServer?.addService(service)
    }
    
    fun sendData(device: BluetoothDevice, data: ByteArray) {
        val service = gattServer?.getService(MESH_SERVICE_UUID) ?: return
        val characteristic = service.getCharacteristic(TX_CHAR_UUID)
        characteristic.value = data
        gattServer?.notifyCharacteristicChanged(device, characteristic, false)
    }
    
    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> connectedDevices.add(device)
                BluetoothProfile.STATE_DISCONNECTED -> connectedDevices.remove(device)
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
                handleReceivedData(device, value)
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
                }
            }
        }
    }
    
    private fun handleReceivedData(device: BluetoothDevice, data: ByteArray) {
        // Process received mesh data
    }
    
    fun stop() {
        gattServer?.close()
        gattServer = null
        connectedDevices.clear()
    }
}
