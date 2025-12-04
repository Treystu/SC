package com.sovereign.communications.ble

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Instrumentation tests for BLE Device Discovery
 * Tests actual BLE scanning functionality on a physical device
 */
@RunWith(AndroidJUnit4::class)
class BLEDeviceDiscoveryInstrumentationTest {
    
    private lateinit var context: Context
    private lateinit var deviceDiscovery: BLEDeviceDiscovery
    private lateinit var bluetoothAdapter: BluetoothAdapter
    
    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        deviceDiscovery = BLEDeviceDiscovery(context)
        
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        
        if (!bluetoothAdapter.isEnabled) {
            throw IllegalStateException("Bluetooth must be enabled to run this test")
        }
    }
    
    @After
    fun teardown() {
        if (deviceDiscovery.isScanning()) {
            deviceDiscovery.stopScanning()
        }
    }
    
    @Test
    fun testBluetoothAvailable() {
        assertNotNull(bluetoothAdapter)
        assertTrue("Bluetooth should be enabled", bluetoothAdapter.isEnabled)
    }
    
    @Test
    fun testStartStopScanning() {
        deviceDiscovery.startScanning { device ->
            // Device discovered
        }
        assertTrue("Scanning should be active", deviceDiscovery.isScanning())
        // Allow time for scanning to initialize
        Thread.sleep(100) // Brief delay to ensure scanning has started
        deviceDiscovery.stopScanning()
        assertFalse("Scanning should be stopped", deviceDiscovery.isScanning())
    }
}
