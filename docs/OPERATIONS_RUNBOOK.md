# Operations Runbook

## Overview

This runbook provides operational procedures for deploying, monitoring, and maintaining Sovereign Communications across all platforms.

## Deployment

### Web Application

#### Build for Production

```bash
cd web
npm run build
```

Output directory: `web/dist/`

#### Deploy to Static Hosting

**Option 1: GitHub Pages**

```bash
# Build the application
npm run build

# Deploy to gh-pages branch
npx gh-pages -d dist
```

**Option 2: Netlify**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

**Option 3: Vercel**

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

#### Deployment Checklist

- [ ] Run all tests: `npm test`
- [ ] Build passes without errors
- [ ] Security audit passes: `npm audit`
- [ ] Performance budget met (check bundle size)
- [ ] Lighthouse score >90 (Performance, Accessibility, Best Practices, SEO)
- [ ] Test in production-like environment
- [ ] Backup current deployment
- [ ] Deploy to production
- [ ] Smoke test critical paths
- [ ] Monitor error rates for 1 hour
- [ ] Update deployment log

### Android Application

#### Build APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

#### Sign APK

```bash
# Generate keystore (first time only)
keytool -genkey -v -keystore sc-release.keystore \
  -alias sc-key -keyalg RSA -keysize 2048 -validity 10000

# Sign APK
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore sc-release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk sc-key

# Verify signature
jarsigner -verify -verbose -certs \
  app/build/outputs/apk/release/app-release-unsigned.apk

# Align APK
zipalign -v 4 app/build/outputs/apk/release/app-release-unsigned.apk \
  app/build/outputs/apk/release/sc-release.apk
```

#### Deploy to Play Store

1. Log into [Google Play Console](https://play.google.com/console)
2. Select your app
3. Navigate to "Release" → "Production"
4. Click "Create new release"
5. Upload signed APK
6. Add release notes
7. Review and roll out

#### Deployment Checklist

- [ ] Run all tests: `./gradlew test`
- [ ] Build passes without errors
- [ ] Security audit passes
- [ ] Test on multiple devices (min API 24, 28, 33)
- [ ] Test different screen sizes
- [ ] Proguard rules verified
- [ ] APK size optimized (<50MB)
- [ ] Backup current Play Store version
- [ ] Deploy to internal testing track
- [ ] Run automated tests on Firebase Test Lab
- [ ] Promote to production
- [ ] Monitor crash reports for 24 hours

### iOS Application

#### Build IPA

```bash
cd ios
xcodebuild -workspace SC.xcworkspace \
  -scheme SC -configuration Release archive \
  -archivePath build/SC.xcarchive
```

#### Export for App Store

```bash
xcodebuild -exportArchive \
  -archivePath build/SC.xcarchive \
  -exportPath build/ \
  -exportOptionsPlist ExportOptions.plist
```

#### Deploy to App Store

1. Open Xcode
2. Product → Archive
3. Window → Organizer
4. Select archive → Distribute App
5. Upload to App Store Connect
6. Log into [App Store Connect](https://appstoreconnect.apple.com)
7. Select your app
8. Add new version
9. Upload build
10. Submit for review

#### Deployment Checklist

- [ ] Run all tests: `xcodebuild test`
- [ ] Build passes without errors
- [ ] Security audit passes
- [ ] Test on iPhone (SE, 14, 15) and iPad
- [ ] Test iOS 15, 16, 17
- [ ] App size optimized (<100MB)
- [ ] Privacy manifest updated
- [ ] Backup current App Store version
- [ ] Deploy to TestFlight
- [ ] Run beta tests
- [ ] Submit for App Store review
- [ ] Monitor crash reports after approval

## Monitoring

### Health Checks

#### Web Application

```javascript
// Add to web/src/utils/health.ts
export async function healthCheck() {
  const checks = {
    crypto: await checkCrypto(),
    storage: await checkStorage(),
    network: await checkNetwork(),
  };
  
  return {
    status: Object.values(checks).every(c => c.healthy) ? 'healthy' : 'degraded',
    checks,
    timestamp: Date.now(),
  };
}

async function checkCrypto() {
  try {
    const identity = generateIdentity();
    const message = new Uint8Array([1, 2, 3]);
    const signature = signMessage(message, identity.privateKey);
    const valid = verifySignature(message, signature, identity.publicKey);
    return { healthy: valid, details: 'Crypto operations working' };
  } catch (error) {
    return { healthy: false, details: error.message };
  }
}

async function checkStorage() {
  try {
    const db = await openDatabase();
    await db.put('health-check', { timestamp: Date.now() });
    await db.get('health-check');
    return { healthy: true, details: 'Storage working' };
  } catch (error) {
    return { healthy: false, details: error.message };
  }
}

async function checkNetwork() {
  const activePeers = networkManager.getActivePeerCount();
  return {
    healthy: true,
    details: `${activePeers} active peers`,
  };
}
```

#### Automated Health Checks

```bash
# Add to package.json scripts
"health": "node scripts/health-check.js"
```

```javascript
// scripts/health-check.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET'
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('✓ Health check passed');
    process.exit(0);
  } else {
    console.error('✗ Health check failed:', res.statusCode);
    process.exit(1);
  }
});

req.on('error', (error) => {
  console.error('✗ Health check error:', error);
  process.exit(1);
});

req.end();
```

### Performance Monitoring

#### Metrics to Track

1. **Response Time**
   - Message send latency
   - Message receive latency
   - Peer connection time

2. **Throughput**
   - Messages per second
   - Bytes transferred per second
   - Active connections

3. **Resource Usage**
   - Memory usage
   - CPU usage (mobile)
   - Battery drain (mobile)
   - Storage usage

4. **Error Rates**
   - Failed messages
   - Connection failures
   - Crypto errors

#### Performance Dashboard

Create a real-time dashboard to monitor:

```typescript
// web/src/components/PerformanceDashboard.tsx
export const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>();
  
  useEffect(() => {
    const monitor = performanceMonitor;
    const unsubscribe = monitor.subscribe(setMetrics);
    return unsubscribe;
  }, []);
  
  return (
    <div className="performance-dashboard">
      <div className="metric">
        <label>FPS</label>
        <value className={metrics?.fps > 30 ? 'good' : 'bad'}>
          {metrics?.fps}
        </value>
      </div>
      <div className="metric">
        <label>Memory</label>
        <value>{metrics?.memory.used.toFixed(2)} MB</value>
      </div>
      <div className="metric">
        <label>Latency</label>
        <value className={metrics?.latency < 100 ? 'good' : 'bad'}>
          {metrics?.latency.toFixed(2)} ms
        </value>
      </div>
    </div>
  );
};
```

### Crash Reporting

#### Web (Sentry Integration)

```bash
npm install @sentry/react @sentry/vite-plugin
```

```typescript
// web/src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

#### Android (Firebase Crashlytics)

```kotlin
// android/app/build.gradle
dependencies {
    implementation 'com.google.firebase:firebase-crashlytics-ktx'
}

// android/app/src/main/java/com/sc/Application.kt
class SCApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseCrashlytics.getInstance().setCrashlyticsCollectionEnabled(true)
    }
}
```

#### iOS (Firebase Crashlytics)

```swift
// ios/SC/SCApp.swift
import FirebaseCrashlytics

@main
struct SCApp: App {
    init() {
        FirebaseApp.configure()
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(true)
    }
}
```

## Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P0 - Critical** | Service completely down | 15 minutes | App won't launch, no messages can be sent |
| **P1 - High** | Major feature broken | 1 hour | File transfers failing, WebRTC not connecting |
| **P2 - Medium** | Minor feature degraded | 4 hours | UI glitch, slow performance |
| **P3 - Low** | Cosmetic issue | 1 week | Typo, minor visual bug |

### Incident Response Process

1. **Detection**
   - Monitor alerts
   - User reports
   - Crash reports

2. **Triage**
   - Assess severity
   - Identify impact
   - Assign owner

3. **Investigation**
   - Review logs
   - Reproduce issue
   - Identify root cause

4. **Resolution**
   - Implement fix
   - Test thoroughly
   - Deploy patch

5. **Post-Mortem**
   - Document incident
   - Identify preventive measures
   - Update runbook

### Common Issues

#### Web Application Won't Load

**Symptoms**: Blank page, loading spinner indefinitely

**Investigation**:
1. Check browser console for errors
2. Verify network requests in DevTools
3. Check if IndexedDB is accessible
4. Verify service worker status

**Resolution**:
1. Clear browser cache
2. Disable service worker
3. Reset IndexedDB
4. Reload application

#### Messages Not Sending

**Symptoms**: Messages stuck in "sending" state

**Investigation**:
1. Check network connectivity
2. Verify peer connections in DevTools
3. Check WebRTC connection state
4. Review mesh routing logs

**Resolution**:
1. Verify WebRTC signaling
2. Check NAT traversal
3. Verify encryption keys
4. Restart peer connections

#### High Memory Usage

**Symptoms**: Application slow, browser tab crashes

**Investigation**:
1. Use browser Memory Profiler
2. Check message cache size
3. Review active connections
4. Check for memory leaks

**Resolution**:
1. Clear message cache
2. Reduce connection pool size
3. Implement pagination
4. Fix memory leaks

#### Android App Crashes on Startup

**Symptoms**: App crashes immediately after launch

**Investigation**:
1. Review Logcat for stack traces
2. Check Room database migration
3. Verify permissions granted
4. Check native library loading

**Resolution**:
1. Fix database schema
2. Request missing permissions
3. Rebuild native libraries
4. Clear app data

## Rollback Procedures

### Web Application

```bash
# Revert to previous deployment
git revert HEAD
npm run build
netlify deploy --prod --dir=dist

# Or restore from backup
netlify rollback
```

### Android Application

1. Log into Google Play Console
2. Navigate to "Release" → "Production"
3. Click "Manage" on current release
4. Select "Replace release"
5. Choose previous version
6. Confirm rollback

### iOS Application

1. Log into App Store Connect
2. Select your app
3. Navigate to "App Store" tab
4. Click version number
5. Select "Remove from Sale" (temporary)
6. Submit previous version for review

## Backup & Recovery

### Database Backups

#### Web (IndexedDB)

```typescript
// Export database
async function exportDatabase() {
  const db = await openDatabase();
  const data = {
    identities: await db.getAll('identities'),
    contacts: await db.getAll('contacts'),
    messages: await db.getAll('messages'),
    conversations: await db.getAll('conversations'),
  };
  
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sc-backup-${Date.now()}.json`;
  a.click();
}

// Import database
async function importDatabase(file: File) {
  const text = await file.text();
  const data = JSON.parse(text);
  
  const db = await openDatabase();
  await db.clear('identities');
  await db.clear('contacts');
  await db.clear('messages');
  await db.clear('conversations');
  
  for (const identity of data.identities) {
    await db.add('identities', identity);
  }
  // ... import other stores
}
```

#### Android (Room)

```kotlin
// Backup database
fun backupDatabase(context: Context) {
    val dbPath = context.getDatabasePath("sc-database").absolutePath
    val backupPath = "${context.getExternalFilesDir(null)}/backup-${System.currentTimeMillis()}.db"
    File(dbPath).copyTo(File(backupPath))
}

// Restore database
fun restoreDatabase(context: Context, backupFile: File) {
    val dbPath = context.getDatabasePath("sc-database").absolutePath
    backupFile.copyTo(File(dbPath), overwrite = true)
}
```

### Disaster Recovery

**Recovery Time Objective (RTO)**: 1 hour
**Recovery Point Objective (RPO)**: 24 hours

1. **Data Loss**
   - Restore from latest backup
   - Verify data integrity
   - Notify affected users

2. **Service Outage**
   - Deploy to backup hosting provider
   - Update DNS if needed
   - Monitor recovery

3. **Security Breach**
   - Immediately revoke compromised keys
   - Force all users to re-authenticate
   - Conduct security audit
   - Deploy patch
   - Notify affected users

## Maintenance Windows

### Scheduled Maintenance

- **Frequency**: Monthly
- **Duration**: 2 hours
- **Time**: Sunday 2:00-4:00 AM UTC
- **Notification**: 7 days advance notice

### Maintenance Tasks

1. Update dependencies
2. Run database maintenance
3. Clear old logs
4. Verify backups
5. Review monitoring alerts
6. Update documentation

## Support

### User Support

- **Email**: support@sovereigncommunications.app (not yet active)
- **GitHub Issues**: https://github.com/Treystu/SC/issues
- **Response Time**: 24-48 hours

### Developer Support

- **GitHub Discussions**: https://github.com/Treystu/SC/discussions
- **Documentation**: https://github.com/Treystu/SC/tree/main/docs

## Metrics & KPIs

### Application Metrics

- Daily Active Users (DAU)
- Monthly Active Users (MAU)
- Message volume
- Average session duration
- Crash-free rate (target: >99.5%)

### Infrastructure Metrics

- Uptime (target: >99.9%)
- Average response time (target: <100ms)
- Error rate (target: <0.1%)
- Resource utilization

### Business Metrics

- User growth rate
- User retention (7-day, 30-day)
- Feature adoption rate
- App Store rating (target: >4.5)

## Review Schedule

- **Daily**: Check crash reports and error logs
- **Weekly**: Review performance metrics
- **Monthly**: Security audit and dependency updates
- **Quarterly**: Disaster recovery drill

---

*Last Updated: 2024-11-15*
*Next Review: 2024-12-15*
