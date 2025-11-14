# BLE Peripheral Configuration Guide

## Overview

This guide covers the configuration and tuning of the BLE peripheral mode implementation for optimal mesh networking performance.

## Task 33: BLE Peripheral Mode

### Advertising Data Optimization

The BLE advertising packet has strict size limits:
- **Legacy advertising**: 31 bytes maximum
- **Extended advertising**: 255 bytes maximum (BLE 5.0+)

#### Advertising Data Structure

```
Flags (3 bytes):
- AD Length: 1 byte
- AD Type: 1 byte (0x01)
- Flags: 1 byte

Service UUID (19 bytes):
- AD Length: 1 byte
- AD Type: 1 byte (0x06)
- 128-bit UUID: 16 bytes

Service Data (variable, max 9 bytes for legacy):
- AD Length: 1 byte  
- AD Type: 1 byte (0x16)
- Service UUID: 16 bytes
- Data: up to 9 bytes
```

**Total overhead**: ~22 bytes
**Available for peer info**: ~9 bytes (legacy)

#### Optimization Strategies

1. **Data Truncation**
```kotlin
private fun optimizeAdvertisingData(peerInfo: ByteArray): ByteArray {
    val maxDataSize = 31 - 3 - 2 - 16 // = 10 bytes
    return if (peerInfo.size > maxDataSize) {
        peerInfo.copyOfRange(0, maxDataSize)
    } else {
        peerInfo
    }
}
```

2. **Use Extended Advertising (BLE 5.0+)**
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    // Can advertise up to 255 bytes
    advertiseDataBuilder.setIncludeDeviceName(true)
}
```

3. **Compress Peer Info**
```kotlin
// Use compact binary format instead of JSON
val compactInfo = ByteBuffer.allocate(10)
    .put(nodeId.toByteArray().copyOf(4))    // 4 bytes
    .put((capabilities shr 8).toByte())      // 2 bytes for capabilities
    .put((capabilities and 0xFF).toByte())
    .putInt(timestamp.toInt())               // 4 bytes
    .array()
```

### Advertising Interval Tuning

#### Interval Modes

| Mode | Interval | TX Power | Use Case |
|------|----------|----------|----------|
| LOW_POWER | 1000ms | LOW | Battery saving |
| BALANCED | 250ms | MEDIUM | Normal operation |
| LOW_LATENCY | 100ms | HIGH | Fast discovery |

#### Configuration

```kotlin
enum class AdvertisingInterval(val intervalMs: Int) {
    LOW_POWER(1000),
    BALANCED(250),
    LOW_LATENCY(100)
}

fun setAdvertisingMode(mode: AdvertiseMode) {
    advertisingInterval = when (mode) {
        AdvertiseMode.LOW_POWER -> AdvertisingInterval.LOW_POWER
        AdvertiseMode.BALANCED -> AdvertisingInterval.BALANCED
        AdvertiseMode.LOW_LATENCY -> AdvertisingInterval.LOW_LATENCY
    }
}
```

#### Power vs. Discovery Trade-offs

**Discovery Time Estimates:**
- LOW_POWER (1000ms): ~3-5 seconds to discover
- BALANCED (250ms): ~1-2 seconds to discover
- LOW_LATENCY (100ms): ~0.5-1 second to discover

**Power Consumption:**
- LOW_POWER: ~0.3mA average
- BALANCED: ~0.8mA average
- LOW_LATENCY: ~1.5mA average

### Peripheral State Management

#### State Diagram

```
STOPPED ──startAdvertising()──> STARTING ──onStartSuccess()──> ADVERTISING
   ↑                                │                              │
   │                                │                              │
   └────────stopAdvertising()───────┴──────────────────────────────┘
                                    │
                                    └──onStartFailure()──> ERROR
```

#### State Transitions

```kotlin
enum class PeripheralState {
    STOPPED,                    // Not advertising
    STARTING,                   // Starting advertising
    ADVERTISING,                // Actively advertising
    CONNECTION_LIMIT_REACHED,   // Max connections reached
    ERROR                       // Advertising failed
}

fun handleStateChange(newState: PeripheralState) {
    when (newState) {
        PeripheralState.ADVERTISING -> {
            // Resume normal operations
        }
        PeripheralState.CONNECTION_LIMIT_REACHED -> {
            // Stop advertising until connection closes
            stopAdvertising()
        }
        PeripheralState.ERROR -> {
            // Retry with backoff
            scheduleRetry()
        }
    }
}
```

### Connection Limit Handling

BLE peripheral mode supports up to **7 simultaneous connections** on most Android devices.

#### Connection Tracking

```kotlin
private val connectionCount = AtomicInteger(0)
private var maxConnections = 7

fun onConnectionEstablished() {
    val count = connectionCount.incrementAndGet()
    if (count >= maxConnections) {
        peripheralState = PeripheralState.CONNECTION_LIMIT_REACHED
        stopAdvertising()
    }
}

fun onConnectionClosed() {
    val count = connectionCount.decrementAndGet()
    if (peripheralState == PeripheralState.CONNECTION_LIMIT_REACHED) {
        // Resume advertising
        peripheralState = PeripheralState.STOPPED
    }
}
```

#### Connection Priority

When at connection limit, prioritize connections by:
1. RSSI strength (keep stronger connections)
2. Activity (keep active connections)
3. Age (keep newer connections)

```kotlin
fun selectConnectionToClose(): BluetoothDevice? {
    return connectedDevices
        .minByOrNull { connection ->
            connection.rssi * 0.5 +
            connection.lastActivityTime * 0.3 +
            connection.connectionAge * 0.2
        }
}
```

## Peripheral Configuration Examples

### Low Power Mode

```kotlin
val advertiser = BLEAdvertiserService(context)
advertiser.setAdvertisingMode(AdvertiseMode.LOW_POWER)
advertiser.setMaxConnections(3)  // Reduce max connections
```

**Expected Performance:**
- Battery: ~0.3% per hour
- Discovery time: 3-5 seconds
- Max peers: 3

### Balanced Mode (Recommended)

```kotlin
val advertiser = BLEAdvertiserService(context)
advertiser.setAdvertisingMode(AdvertiseMode.BALANCED)
advertiser.setMaxConnections(7)
```

**Expected Performance:**
- Battery: ~0.8% per hour
- Discovery time: 1-2 seconds
- Max peers: 7

### High Performance Mode

```kotlin
val advertiser = BLEAdvertiserService(context)
advertiser.setAdvertisingMode(AdvertiseMode.LOW_LATENCY)
advertiser.setMaxConnections(7)
```

**Expected Performance:**
- Battery: ~1.5% per hour
- Discovery time: 0.5-1 second
- Max peers: 7

## Monitoring and Metrics

### Statistics

```kotlin
val stats = advertiser.getStats()
println("""
    State: ${stats["state"]}
    Connections: ${stats["connectionCount"]}/${stats["maxConnections"]}
    Mode: ${stats["advertiseMode"]}
    Interval: ${stats["advertisingInterval"]}ms
    Uptime: ${stats["uptimeMs"]}ms
""")
```

### Health Checks

```kotlin
fun checkPeripheralHealth(): Boolean {
    val stats = advertiser.getStats()
    
    // Check if advertising
    if (stats["state"] != "ADVERTISING") return false
    
    // Check if accepting connections
    val connCount = stats["connectionCount"] as Int
    val maxConn = stats["maxConnections"] as Int
    if (connCount >= maxConn) return false
    
    // Check uptime
    val uptimeMs = stats["uptimeMs"] as Long
    if (uptimeMs < 1000) return false // Just started
    
    return true
}
```

## Best Practices

1. **Start with BALANCED mode** - Good compromise between power and performance
2. **Monitor connection count** - Stop advertising when at limit
3. **Optimize peer info** - Keep advertising data under 10 bytes
4. **Handle errors gracefully** - Retry with exponential backoff
5. **Track metrics** - Monitor state changes and connection patterns
6. **Test on real devices** - BLE behavior varies by manufacturer
7. **Handle background transitions** - Adjust intervals when app backgrounds

## Troubleshooting

### Advertising Fails to Start

**Error: ADVERTISE_FAILED_DATA_TOO_LARGE**
- Reduce peer info size
- Remove device name from advertising data
- Use extended advertising (BLE 5.0+)

**Error: ADVERTISE_FAILED_TOO_MANY_ADVERTISERS**
- Stop other BLE advertisers
- Wait and retry
- Check for app conflicts

**Error: ADVERTISE_FAILED_FEATURE_UNSUPPORTED**
- Check device BLE capabilities
- Reduce to legacy advertising parameters
- Test on different device

### Poor Discovery Performance

**Symptoms:**
- Devices take > 5 seconds to discover
- Intermittent discovery

**Solutions:**
- Increase advertising frequency
- Increase TX power level
- Check for interference (WiFi, other BLE devices)
- Verify advertising data is correct

### High Battery Drain

**Symptoms:**
- >2% battery drain per hour
- Device heating up

**Solutions:**
- Reduce advertising frequency
- Lower TX power
- Limit max connections
- Enable adaptive mode
- Check for connection leaks

## References

- [Android BLE Advertising Guide](https://developer.android.com/guide/topics/connectivity/bluetooth-le)
- [Bluetooth Core Specification](https://www.bluetooth.com/specifications/bluetooth-core-specification/)
- [BLE Advertising Packet Format](https://www.bluetooth.com/specifications/assigned-numbers/generic-access-profile/)
