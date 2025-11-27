package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

class BLEGATTClient(private val context: Context) {
    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private val operationQueue = ConcurrentLinkedQueue<Runnable>()
    private var isOperationInProgress = false
    private val mainHandler = Handler(Looper.getMainLooper())
    
    companion object {
        private const val TAG = "BLEGATTClient"
    }
    
    fun connect(device: BluetoothDevice) {
        Log.d(TAG, "Connecting to ${device.address}")
        bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }
    
    fun sendData(data: ByteArray) {
        enqueueOperation {
            rxCharacteristic?.let { char ->
                char.value = data
                char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                val success = bluetoothGatt?.writeCharacteristic(char) ?: false
                if (!success) {
                    Log.e(TAG, "Failed to write characteristic")
                    onOperationComplete()
                }
            } ?: run {
                Log.e(TAG, "RX Characteristic not found")
                onOperationComplete()
            }
        }
    }
    
    private fun enqueueOperation(operation: Runnable) {
        operationQueue.add(operation)
        if (!isOperationInProgress) {
            executeNextOperation()
        }
    }
    
    private fun executeNextOperation() {
        if (operationQueue.isEmpty()) {
            isOperationInProgress = false
            return
        }
        
        isOperationInProgress = true
        val operation = operationQueue.poll()
        mainHandler.post {
            operation?.run()
        }
    }
    
    private fun onOperationComplete() {
        isOperationInProgress = false
        executeNextOperation()
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
                        disconnect()
                    }
                }
            } else {
                Log.e(TAG, "Connection failed: $status")
                disconnect()
            }
        }
        
        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val service = gatt.getService(BLEGATTServer.MESH_SERVICE_UUID)
                txCharacteristic = service?.getCharacteristic(BLEGATTServer.TX_CHAR_UUID)
                rxCharacteristic = service?.getCharacteristic(BLEGATTServer.RX_CHAR_UUID)
                
                txCharacteristic?.let {
                    gatt.setCharacteristicNotification(it, true)
                    val descriptor = it.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))
                    if (descriptor != null) {
                        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        gatt.writeDescriptor(descriptor)
                    }
                }
            } else {
                Log.e(TAG, "Service discovery failed: $status")
            }
        }
        
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            if (characteristic.uuid == BLEGATTServer.TX_CHAR_UUID) {
                handleReceivedData(characteristic.value)
            }
        }
        
        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            super.onCharacteristicWrite(gatt, characteristic, status)
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Write successful")
            } else {
                Log.e(TAG, "Write failed: $status")
            }
            onOperationComplete()
        }
        
        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            super.onDescriptorWrite(gatt, descriptor, status)
            Log.d(TAG, "Descriptor write status: $status")
        }
    }
    
    private fun handleReceivedData(data: ByteArray) {
        Log.d(TAG, "Received ${data.size} bytes")
        // Process received data
    }
    
    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        operationQueue.clear()
        isOperationInProgress = false
    }
}
