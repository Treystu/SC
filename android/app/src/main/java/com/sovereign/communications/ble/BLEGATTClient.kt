package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context

class BLEGATTClient(private val context: Context) {
    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    
    fun connect(device: BluetoothDevice) {
        bluetoothGatt = device.connectGatt(context, false, gattCallback)
    }
    
    fun sendData(data: ByteArray) {
        rxCharacteristic?.let { char ->
            char.value = data
            bluetoothGatt?.writeCharacteristic(char)
        }
    }
    
    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    disconnect()
                }
            }
        }
        
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(BLEGATTServer.MESH_SERVICE_UUID)
                txCharacteristic = service?.getCharacteristic(BLEGATTServer.TX_CHAR_UUID)
                rxCharacteristic = service?.getCharacteristic(BLEGATTServer.RX_CHAR_UUID)
                
                txCharacteristic?.let {
                    gatt.setCharacteristicNotification(it, true)
                }
            }
        }
        
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == BLEGATTServer.TX_CHAR_UUID) {
                handleReceivedData(characteristic.value)
            }
        }
    }
    
    private fun handleReceivedData(data: ByteArray) {
        // Process received data
    }
    
    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
    }
}
