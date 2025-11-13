# Sovereign Communications - User Guide

## Getting Started

### Installation

**Web Application:**
1. Navigate to the hosted application URL
2. Click "Install" button for PWA functionality
3. Or use directly in browser

**Android:**
1. Download APK from releases
2. Enable "Install from Unknown Sources"
3. Install and grant required permissions

**iOS:**
1. Download from TestFlight (development)
2. Or build from source using Xcode

### First Launch

1. **Identity Creation:**
   - App automatically generates Ed25519 keypair
   - Securely stored in platform keystore
   - Your identity is your public key

2. **Add Your First Contact:**
   - QR Code: Scan peer's QR or show yours
   - Manual: Enter peer's IP:port
   - mDNS: Auto-discover on local network

### Messaging

**Send a Message:**
1. Select conversation from list
2. Type message in input field
3. Press send or Enter
4. Message encrypted automatically

**Voice Messages:**
1. Tap microphone icon
2. Hold to record, release to send
3. Tap to pause/resume recording

**File Sharing:**
1. Tap attachment icon
2. Select file from device
3. Transfer happens peer-to-peer

### Peer Discovery

**QR Code Pairing:**
- Go to Settings > Identity
- Show QR code to peer
- Or scan peer's QR code

**Local Network:**
- Automatic discovery via mDNS
- Peers appear in discovery list
- Tap to connect

**Manual Connection:**
- Settings > Add Peer
- Enter IP address and port
- Connection established via WebRTC

### Security

**Message Encryption:**
- All messages use ChaCha20-Poly1305
- Ed25519 signatures verify authenticity
- Perfect forward secrecy with session keys

**Backup Identity:**
1. Settings > Backup Identity
2. Enter strong password
3. Save encrypted backup file safely
4. Can restore on new device

### Troubleshooting

**Cannot Connect to Peer:**
- Check network connectivity
- Verify firewall settings
- Try manual IP entry
- Check peer is online

**Messages Not Delivering:**
- Verify peer connection status
- Check TTL hasn't expired
- Try reconnecting to peer

**App Performance Issues:**
- Clear message cache
- Restart application
- Check device storage space
