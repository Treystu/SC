# Deployment Guide

## Web Application Deployment

### Build for Production

```bash
cd web
npm install
npm run build
```

Output directory: `web/dist/`

### Deploy to Netlify

```bash
netlify deploy --prod --dir=web/dist
```

### Deploy to Vercel

```bash
vercel --prod
```

### Self-Hosted (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name comm.example.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    root /var/www/sovereign-communications;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Android Application Deployment

### Build Release APK

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### Sign APK

```bash
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore keystore.jks \
  app-release-unsigned.apk \
  alias_name
```

### Google Play Store

1. Create signed bundle:
```bash
./gradlew bundleRelease
```

2. Upload `app-release.aab` to Google Play Console

## iOS Application Deployment

### Build for App Store

1. Open project in Xcode
2. Select "Any iOS Device" as target
3. Product → Archive
4. Upload to App Store Connect

### TestFlight Distribution

1. Archive the app
2. Upload to App Store Connect
3. Submit for TestFlight review
4. Add testers once approved

## Self-Hosted Infrastructure

### mDNS/Bonjour (Optional)

For local network discovery:

**Linux:**
```bash
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon
```

**macOS:** Built-in, no setup needed

**Windows:** Install Bonjour Print Services

### Monitoring

```typescript
const health = await network.getHealthStats();
console.log('Connected peers:', health.peerCount);
console.log('Messages sent:', health.messagesSent);
```

## Security Considerations

1. **HTTPS Only** for web deployment
2. **Code Signing** for mobile apps
3. **Key Backup** - Educate users about identity backup
4. **Permissions** - Request only necessary permissions
