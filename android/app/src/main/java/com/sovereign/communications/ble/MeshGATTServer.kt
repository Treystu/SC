package com.sovereign.communications.ble

import android.bluetooth.*
import android.content.Context
import android.util.Log
import java.util.UUID

class MeshGATTServer(private val context: Context) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private var gattServer: BluetoothGattServer? = null
    private val connectedDevices = mutableSetOf<BluetoothDevice>()
    private var messageCallback: ((ByteArray) -> Unit)? = null

    companion object {
        private const val TAG = "MeshGATTServer"
        val MESH_SERVICE_UUID: UUID = UUID.fromString("00001234-0000-1000-8000-00805f9b34fb")
        val TX_CHARACTERISTIC_UUID: UUID = UUID.fromString("00001235-0000-1000-8000-00805f9b34fb")
        val RX_CHARACTERISTIC_UUID: UUID = UUID.fromString("00001236-0000-1000-8000-00805f9b34fb")
    }

    fun start(onMessageReceived: (ByteArray) -> Unit) {
        messageCallback = onMessageReceived

        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)

        // Create GATT service
        val service = BluetoothGattService(
            MESH_SERVICE_UUID,
            BluetoothGattService.SERVICE_TYPE_PRIMARY
        )

        // TX characteristic (server -> client notifications)
        val txCharacteristic = BluetoothGattCharacteristic(
            TX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )
        txCharacteristic.addDescriptor(
            BluetoothGattDescriptor(
                UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"), // CCC descriptor
                BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
            )
        )

        // RX characteristic (client -> server writes)
        val rxCharacteristic = BluetoothGattCharacteristic(
            RX_CHARACTERISTIC_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        service.addCharacteristic(txCharacteristic)
        service.addCharacteristic(rxCharacteristic)

        gattServer?.addService(service)
        Log.i(TAG, "GATT server started")
    }

    fun stop() {
        gattServer?.close()
        gattServer = null
        connectedDevices.clear()
    }

    fun sendMessage(message: ByteArray, device: BluetoothDevice? = null) {
        val service = gattServer?.getService(MESH_SERVICE_UUID) ?: return
        val characteristic = service.getCharacteristic(TX_CHARACTERISTIC_UUID) ?: return

        val devicesToNotify = if (device != null) {
            listOf(device)
        } else {
            connectedDevices.toList()
        }

        for (dev in devicesToNotify) {
            characteristic.value = message
            gattServer?.notifyCharacteristicChanged(dev, characteristic, false)
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            if (device == null) return

            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    connectedDevices.add(device)
                    Log.i(TAG, "Device connected: ${device.address}")
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    connectedDevices.remove(device)
                    Log.i(TAG, "Device disconnected: ${device.address}")
                }
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (characteristic?.uuid == RX_CHARACTERISTIC_UUID && value != null) {
                Log.d(TAG, "Received message: ${value.size} bytes")
                messageCallback?.invoke(value)
            }

            if (responseNeeded) {
                gattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    offset,
                    value
                )
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice?,
            requestId: Int,
            descriptor: BluetoothGattDescriptor?,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray?
        ) {
            if (responseNeeded) {
                gattServer?.sendResponse(
                    device,
                    requestId,
                    BluetoothGatt.GATT_SUCCESS,
                    offset,
                    value
                )
            }
        }
    }

    fun getConnectedDeviceCount() = connectedDevices.size
}
