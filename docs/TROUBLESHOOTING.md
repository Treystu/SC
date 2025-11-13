# Troubleshooting Guide

## Common Issues and Solutions

### Connection Issues

**Problem**: Unable to connect to peers
- Check network connectivity
- Verify WebRTC is enabled in browser
- Ensure firewall allows peer-to-peer connections
- Try manual peer entry with IP:port

**Problem**: Bluetooth mesh not working
- Verify Bluetooth is enabled
- Check app has location permissions (Android)
- Ensure device supports BLE
- Try restarting Bluetooth

### Message Delivery Issues

**Problem**: Messages not being delivered
- Check peer is online and connected
- Verify encryption keys are synced
- Check message is not too large (use fragmentation)
- Review message TTL settings

**Problem**: Duplicate messages
- Clear message cache
- Check deduplication is enabled
- Verify peer connections

### Performance Issues

**Problem**: App is slow or laggy
- Clear message history/cache
- Reduce number of active connections
- Check available memory
- Disable background sync if on battery

**Problem**: High battery drain
- Enable battery-efficient BLE scanning
- Reduce message sync frequency
- Disable unnecessary background services
- Check for connection loops

### Security Issues

**Problem**: Key exchange failing
- Reset identity and regenerate keys
- Verify both peers using compatible versions
- Check system time is correct
- Try manual key verification via QR code

**Problem**: Cannot decrypt messages
- Verify session keys are valid
- Check key rotation settings
- Ensure sender and receiver keys match
- Try re-establishing connection

### Platform-Specific Issues

**Android**:
- Grant all required permissions
- Disable battery optimization for app
- Enable background data usage
- Check Doze mode settings

**iOS**:
- Enable background modes in settings
- Check notification permissions
- Verify VoIP background mode active
- Review privacy settings

**Web**:
- Enable notifications in browser
- Check IndexedDB quota
- Clear browser cache if needed
- Verify service worker registered

### Data Issues

**Problem**: Messages missing after app restart
- Check database integrity
- Verify backup exists
- Review offline storage settings
- Restore from backup if needed

**Problem**: Cannot import/export data
- Check file format is correct
- Verify file permissions
- Ensure encryption key available
- Try smaller data batch

## Getting Help

If issues persist:
1. Check logs for error messages
2. Review network diagnostics
3. Test with minimal configuration
4. Report bug with reproduction steps
