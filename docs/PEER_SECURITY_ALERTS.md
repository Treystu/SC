# Peer Security Alert System - Complete Implementation Guide

**Version:** 1.0  
**Date:** 2025-11-18  
**Status:** Production Ready

## Overview

The Peer Security Alert System is a decentralized security feature that enables mesh network participants to warn each other about compromised identities, malicious actors, and suspicious behavior without relying on central authority.

### Key Features

- **Decentralized Trust Model**: No central authority - users decide which alerts to trust
- **Reputation Scoring**: Automatic peer reputation tracking based on community reports
- **Alert Types**: 8 distinct alert types covering all major security incidents
- **Multi-Platform**: Full implementation across Web (React), Android (Kotlin/Compose), iOS (Swift/SwiftUI)
- **TTL-Based Propagation**: Alerts propagate through mesh with controlled hop limits
- **Signature Verification**: All alerts cryptographically signed by reporters
- **Alert Revocation**: Original reporters can revoke false alarms

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ SecurityAlerts│  │SecurityAlerts│  │SecurityAlerts│      │
│  │   (React)    │  │  (Compose)   │  │  (SwiftUI)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────┐
│         │       Core Alert System              │              │
│  ┌──────▼────┐  ┌──────▼─────┐  ┌────▼────────┐            │
│  │PeerSecurity│  │PeerSecurity│  │PeerSecurity │            │
│  │AlertSystem │  │AlertSystem │  │AlertSystem  │            │
│  │(TypeScript)│  │  (Kotlin)  │  │  (Swift)    │            │
│  └────────────┘  └────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
          │                  │                  │
┌─────────┼──────────────────┼──────────────────┼──────────────┐
│         │         Storage Layer               │              │
│  ┌──────▼────┐  ┌──────▼─────┐  ┌────▼────────┐            │
│  │ IndexedDB │  │ Room DB    │  │ UserDefaults│            │
│  │  + JSON   │  │ + SQLite   │  │ + CoreData  │            │
│  └───────────┘  └────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Alert Creation**
   - User reports security issue via UI
   - System creates signed alert with evidence
   - Alert stored locally in database
   - Reputation updated for reported peer
   - Alert broadcast to mesh network

2. **Alert Reception**
   - Peer receives alert from network
   - Signature verified against reporter's public key
   - Age and TTL checked
   - Duplicate detection
   - Stored if valid, callbacks triggered

3. **Alert Propagation**
   - TTL decreased by 1
   - Relayed to connected peers if TTL > 0
   - Eventually expires after max hops

4. **Reputation Impact**
   - Each alert adjusts peer reputation score
   - Severity determines impact magnitude
   - Multiple reports accumulate
   - Auto-block recommendations at low scores

## Alert Types

### 1. IDENTITY_COMPROMISE
**Use Case:** Device stolen, keys leaked, malware infection  
**Severity:** Typically CRITICAL  
**Impact:** -20 reputation points  
**Example:**
```typescript
const alert = await createDeviceTheftAlert(
  stolenPeerId,
  myPeerId,
  myPrivateKey,
  "iPhone stolen from car at 2pm"
);
```

### 2. SPAM_BEHAVIOR
**Use Case:** Excessive message flooding  
**Severity:** Typically MEDIUM  
**Impact:** -10 reputation points  
**Example:**
```typescript
const alert = await createSpamAlert(
  spammerPeerId,
  myPeerId,
  myPrivateKey,
  150 // message count
);
```

### 3. PROTOCOL_VIOLATION
**Use Case:** Malformed messages, invalid signatures  
**Severity:** MEDIUM to HIGH  
**Impact:** -10 to -15 points

### 4. SIGNATURE_ANOMALY
**Use Case:** Conflicting signatures from same peer ID  
**Severity:** HIGH  
**Impact:** -15 points

### 5. SYBIL_ATTACK
**Use Case:** Multiple fake identities detected  
**Severity:** HIGH to CRITICAL  
**Impact:** -15 to -20 points

### 6. ECLIPSE_ATTACK
**Use Case:** Attempt to isolate peers  
**Severity:** HIGH  
**Impact:** -15 points

### 7. MALICIOUS_ACTIVITY
**Use Case:** General bad behavior  
**Severity:** Varies  
**Impact:** -5 to -20 points

### 8. ALERT_REVOKED
**Use Case:** Original reporter revokes false alarm  
**Severity:** INFO  
**Impact:** Removes original alert from active list

## Reputation System

### Scoring

- **Initial Score:** 50/100 (neutral)
- **Range:** -100 to +100
- **Block Threshold:** < 20 (recommended)

### Impact Table

| Severity | Reputation Impact |
|----------|-------------------|
| CRITICAL | -20 points        |
| HIGH     | -15 points        |
| MEDIUM   | -10 points        |
| LOW      | -5 points         |
| INFO     | -2 points         |

### Reputation Metadata

```typescript
interface PeerReputation {
  peerId: string;
  score: number;              // -100 to 100
  positiveReports: number;    // Count of positive interactions
  negativeReports: number;    // Count of negative reports
  activeAlerts: SecurityAlert[]; // Current alerts against peer
  lastUpdated: number;        // Timestamp
}
```

## Integration Guide

### Web (React + TypeScript)

**1. Import Components:**
```typescript
import { SecurityAlerts } from './components/SecurityAlerts';
import { PeerSecurityAlertSystem } from '@sc/core/mesh/peer-security-alerts';
```

**2. Initialize System:**
```typescript
const alertSystem = new PeerSecurityAlertSystem();
const currentPeerId = "my-peer-id";
```

**3. Add to App:**
```tsx
<SecurityAlerts 
  alertSystem={alertSystem}
  currentPeerId={currentPeerId}
/>
```

**4. Subscribe to Alerts:**
```typescript
alertSystem.onAlertReceived((alert) => {
  console.log('New security alert:', alert);
  
  // Show notification for high severity
  if (alert.severity === AlertSeverity.HIGH || alert.severity === AlertSeverity.CRITICAL) {
    new Notification('Security Alert', {
      body: alert.description
    });
  }
});
```

### Android (Kotlin + Jetpack Compose)

**1. Add to Database:**
```kotlin
@Database(
  entities = [SecurityAlert::class, PeerReputation::class],
  version = 1
)
abstract class SCDatabase : RoomDatabase() {
    abstract fun securityAlertDao(): SecurityAlertDao
    abstract fun peerReputationDao(): PeerReputationDao
}
```

**2. Initialize System:**
```kotlin
val alertSystem = PeerSecurityAlertSystem(
    context = context,
    alertDao = database.securityAlertDao(),
    reputationDao = database.peerReputationDao()
)
```

**3. Add to Navigation:**
```kotlin
composable("security-alerts") {
    SecurityAlertsScreen(
        viewModel = SecurityAlertsViewModel(alertSystem, alertDao)
    )
}
```

**4. Handle Incoming Alerts:**
```kotlin
alertSystem.onAlertReceived { alert ->
    lifecycleScope.launch {
        // Show notification
        if (alert.severity == AlertSeverity.HIGH || alert.severity == AlertSeverity.CRITICAL) {
            showNotification(alert)
        }
    }
}
```

### iOS (Swift + SwiftUI)

**1. Initialize System:**
```swift
let alertSystem = PeerSecurityAlertSystem()

// Load persisted alerts
try? alertSystem.loadAlerts()
```

**2. Create View:**
```swift
struct SecurityAlertsView: View {
    @StateObject private var viewModel: SecurityAlertsViewModel
    
    init(alertSystem: PeerSecurityAlertSystem) {
        _viewModel = StateObject(wrappedValue: SecurityAlertsViewModel(alertSystem: alertSystem))
    }
    
    var body: some View {
        NavigationView {
            // UI implementation
        }
    }
}
```

**3. Subscribe to Alerts:**
```swift
alertSystem.onAlertReceived { alert in
    DispatchQueue.main.async {
        // Update UI
        self.alerts.insert(alert, at: 0)
        
        // Show notification
        if alert.severity == .high || alert.severity == .critical {
            self.showNotification(for: alert)
        }
    }
}
```

## Mesh Network Integration

### Broadcasting Alerts

```typescript
// When creating/receiving alert, broadcast to mesh
async function broadcastAlert(alert: SecurityAlert) {
  const peers = routingTable.getAllPeers();
  
  for (const peer of peers) {
    // Prepare for relay (decrease TTL)
    const relayAlert = alertSystem.prepareForRelay(alert);
    
    if (relayAlert) {
      await sendMessageToPeer(peer.id, {
        type: 'SECURITY_ALERT',
        payload: relayAlert
      });
    }
  }
}
```

### Receiving from Mesh

```typescript
// In message handler
async function handleMessage(message: Message) {
  if (message.type === 'SECURITY_ALERT') {
    const alert = message.payload as SecurityAlert;
    const reporterPublicKey = await getPublicKey(alert.reporterId);
    
    const valid = await alertSystem.processAlert(alert, reporterPublicKey);
    
    if (valid) {
      // Relay to other peers
      await broadcastAlert(alert);
    }
  }
}
```

### Auto-Blocking Malicious Peers

```typescript
// Before accepting connection
async function shouldAcceptPeer(peerId: string): Promise<boolean> {
  const reputation = alertSystem.getPeerReputation(peerId);
  
  if (reputation.score < 20) {
    console.warn(`Blocking peer ${peerId} due to low reputation: ${reputation.score}`);
    return false;
  }
  
  // Check for critical alerts
  const criticalAlerts = reputation.activeAlerts.filter(
    a => a.severity === AlertSeverity.CRITICAL
  );
  
  if (criticalAlerts.length > 0) {
    console.warn(`Blocking peer ${peerId} due to ${criticalAlerts.length} critical alerts`);
    return false;
  }
  
  return true;
}
```

## UI Components

### Alert List (All Platforms)

Features:
- Color-coded by severity (Red=Critical, Orange=High, Yellow=Medium, Blue=Low, Gray=Info)
- Time-ago timestamps
- Reporter and suspicious peer IDs (truncated)
- Click to view details
- Empty state with "No alerts" message

### Report Dialog (All Platforms)

Fields:
- Alert Type (dropdown)
- Severity (dropdown)
- Suspicious Peer ID (text input)
- Description (textarea)
- Submit/Cancel buttons

### Alert Details Modal (All Platforms)

Shows:
- Complete alert information
- Evidence JSON (if present)
- Peer reputation score
- Active alerts count
- Block recommendation (if score < 20)

## Security Considerations

### Trust Model

- **No Central Authority**: Alerts are informational, not authoritative
- **User Autonomy**: Each user decides which alerts to trust
- **Out-of-Band Verification**: Critical alerts should be verified through alternative channels
- **Reporter Reputation**: Consider the reputation of the alert reporter

### Attack Vectors

**1. False Reports**
- **Mitigation**: Alert revocation system, reputation of reporter matters
- **Defense**: Multiple independent reports required for serious action

**2. Sybil Attacks on Alerts**
- **Mitigation**: Proof-of-work required for alert creation (optional)
- **Defense**: Trust established peers more than new ones

**3. Alert Flooding**
- **Mitigation**: TTL limits propagation, age-based expiration
- **Defense**: Rate limiting on alert creation per peer

**4. Signature Forgery**
- **Mitigation**: Ed25519 signature verification
- **Defense**: Public key infrastructure with out-of-band verification

### Privacy

- **No PII**: Alerts contain peer IDs only, no personal information
- **Local Storage**: Alerts stored locally, not transmitted to central server
- **Voluntary Reporting**: Users choose what to report and when
- **Evidence Redaction**: Sensitive evidence can be omitted

## Testing

### Unit Tests

All implementations include comprehensive test suites:

**TypeScript:**
```bash
cd core
npm test peer-security-alerts.test.ts
```

**Kotlin:**
```bash
cd android
./gradlew test --tests PeerSecurityAlertsTest
```

**Swift:**
```bash
cd ios
xcodebuild test -scheme SovereignCommunications -destination 'platform=iOS Simulator,name=iPhone 14'
```

### Integration Testing

**Test Scenario 1: Device Theft**
1. User A reports device stolen (creates IDENTITY_COMPROMISE alert)
2. Alert broadcasts to mesh
3. User B receives and verifies alert
4. User B's UI shows alert
5. User B sees reputation decrease for compromised peer
6. User B's system auto-blocks compromised peer (score < 20)

**Test Scenario 2: Spam Detection**
1. User A detects spam from peer X (150+ messages)
2. User A creates SPAM_BEHAVIOR alert
3. Multiple users report same peer
4. Peer X's reputation drops to 10/100
5. Network collectively blocks peer X
6. Peer X cannot effectively participate

**Test Scenario 3: False Alarm**
1. User A mistakenly reports legitimate peer
2. User A realizes mistake
3. User A revokes alert using original alert ID
4. ALERT_REVOKED broadcast to mesh
5. Peer's reputation partially recovers
6. Active alert removed from reputation record

## Performance

### Storage Requirements

- **Per Alert**: ~500 bytes (header + signature + evidence)
- **1000 Alerts**: ~500 KB
- **10,000 Alerts**: ~5 MB (with 7-day cleanup)

### Network Overhead

- **Alert Size**: 400-600 bytes (varies with evidence)
- **Propagation**: TTL=5 means max 5 hops
- **Bandwidth**: Minimal impact (~10 KB/day typical use)

### CPU Impact

- **Signature Verification**: ~0.5ms per alert (Ed25519)
- **Storage Operations**: IndexedDB/Room/UserDefaults (async, minimal impact)
- **UI Updates**: React/Compose/SwiftUI (efficient reactivity)

## Monitoring

### Statistics

All platforms provide statistics via `getStatistics()`:

```typescript
const stats = alertSystem.getStatistics();
console.log(stats);
/*
{
  totalAlerts: 47,
  alertsByType: {
    identityCompromise: 3,
    spam: 28,
    protocolViolation: 10,
    // ...
  },
  alertsBySeverity: {
    critical: 3,
    high: 12,
    medium: 25,
    // ...
  },
  trackedPeers: 156,
  peersWithNegativeReputation: 18
}
*/
```

### Logging

Enable debug logging to monitor alert system:

```typescript
// TypeScript
alertSystem.onAlertReceived((alert) => {
  console.debug('[SecurityAlert]', alert.type, alert.severity, alert.description);
});

// Kotlin
alertSystem.onAlertReceived { alert ->
    Log.d("SecurityAlert", "${alert.type} ${alert.severity}: ${alert.description}")
}

// Swift
alertSystem.onAlertReceived { alert in
    print("[SecurityAlert] \(alert.type) \(alert.severity): \(alert.description)")
}
```

## Incident Response Integration

The Peer Security Alert System integrates with the [Incident Response Playbook](INCIDENT_RESPONSE_PLAYBOOK.md):

### Device Theft (Scenario 1)
```typescript
// Step 1: User reports device theft
const alert = await alertSystem.createDeviceTheftAlert(
  stolenDevicePeerId,
  myPeerId,
  myPrivateKey,
  "iPhone 12, stolen 2024-01-15 14:30 from parking lot"
);

// Step 2: Broadcast to mesh
await broadcastSecurityAlert(alert);

// Step 3: Generate new keypair
await identity.generateNewKeys();

// Step 4: Notify contacts out-of-band
await notifyTrustedContacts("My device was stolen, new key: " + newPublicKey);
```

### Malicious Peer (Scenario 5)
```typescript
// Auto-detect and report
if (peer.messageCount > SPAM_THRESHOLD) {
  const alert = await alertSystem.createSpamAlert(
    peer.id,
    myPeerId,
    myPrivateKey,
    peer.messageCount
  );
  
  await broadcastSecurityAlert(alert);
  routingTable.blacklistPeer(peer.id, 3600000); // 1 hour
}
```

## Best Practices

1. **Verify Before Reporting**: Only report confirmed security issues
2. **Provide Evidence**: Include relevant metadata in evidence field
3. **Out-of-Band Verification**: For critical alerts, verify via other channels
4. **Revoke Mistakes**: Use alert revocation for false alarms
5. **Monitor Reputation**: Regularly check peer reputations before trusting
6. **Cleanup Old Alerts**: Run cleanup() periodically to remove expired alerts
7. **User Education**: Inform users that alerts are informational, not authoritative
8. **Rate Limiting**: Don't spam alerts - reduces your own reputation as reporter

## Future Enhancements

### V1.1 Roadmap

- [ ] Proof-of-Work for alert creation (prevent spam)
- [ ] Multi-signature alerts (require N reporters for serious action)
- [ ] Alert aggregation (combine similar reports)
- [ ] Reputation decay (old negative reports fade over time)
- [ ] Trust circles (weight alerts from trusted contacts higher)
- [ ] Alert analytics dashboard
- [ ] Machine learning for spam detection
- [ ] Cross-platform alert sync

### V2.0 Roadmap

- [ ] Zero-knowledge proofs for anonymous reporting
- [ ] Distributed consensus for critical alerts
- [ ] Smart contract integration for tamper-proof alert history
- [ ] Federation with other mesh networks
- [ ] AI-powered threat intelligence

## Support

For issues, questions, or contributions:

- **GitHub Issues**: https://github.com/Treystu/SC/issues
- **Security Email**: security@sovereigncommunications.app
- **Documentation**: See `docs/` directory

## License

Copyright 2025 Sovereign Communications  
Licensed under MIT License

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-18  
**Author:** Security Team  
**Review Schedule:** Quarterly
