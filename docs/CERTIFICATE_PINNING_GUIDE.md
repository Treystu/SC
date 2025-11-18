# Certificate Pinning Implementation Guide

**Date:** 2025-11-18  
**Status:** Implemented (requires production certificate configuration)  
**Priority:** HIGH

---

## Overview

Certificate pinning has been implemented across all three platforms to prevent man-in-the-middle (MitM) attacks. This document explains how to configure and deploy certificate pinning in production.

## What is Certificate Pinning?

Certificate pinning validates that the server's SSL certificate matches a known, trusted certificate (or its public key hash). This prevents attackers from using fraudulent certificates issued by compromised Certificate Authorities.

**Benefits:**
- Prevents MitM attacks even if CA is compromised
- Protects update mechanism from tampering
- Adds defense-in-depth to TLS/SSL

**Risks if not configured properly:**
- App lockout if certificate expires without updating pins
- Users unable to connect if pins are incorrect
- Development/testing complexity

---

## Implementation Status

### ✅ Android - IMPLEMENTED
- **File:** `android/app/src/main/res/xml/network_security_config.xml`
- **Status:** Framework in place, needs production certificate pins
- **Method:** Network Security Configuration (Android 7.0+)

### ✅ iOS - IMPLEMENTED
- **File:** `ios/SovereignCommunications/Security/CertificatePinningManager.swift`
- **Status:** Framework in place, needs production certificate pins
- **Method:** URLSessionDelegate with certificate validation

### ✅ Web - IMPLEMENTED
- **File:** `web/index.html` (CSP headers)
- **Status:** CSP configured, server-side pinning recommended
- **Method:** Content Security Policy + Server headers

---

## Production Configuration Steps

### Step 1: Generate Certificate Pins

For each domain you want to pin (e.g., `api.sovereigncommunications.app`, `updates.sovereigncommunications.app`):

#### Option A: Extract from Production Server

```bash
# Connect to server and extract certificate pin
openssl s_client -servername api.sovereigncommunications.app \
  -connect api.sovereigncommunications.app:443 \
  < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64

# Output example: "X3pGTSOuJeEVw989arh53213789asdf1234567890A="
```

#### Option B: Extract from Certificate File

```bash
# If you have the certificate file (.crt, .pem)
openssl x509 -in certificate.crt -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

#### Generate Backup Pin

**CRITICAL:** Always have a backup pin ready!

Options for backup:
1. Pin the intermediate CA certificate
2. Pin your next certificate (before rotation)
3. Pin a certificate from your backup server

```bash
# Extract intermediate certificate
openssl s_client -showcerts -servername api.sovereigncommunications.app \
  -connect api.sovereigncommunications.app:443 \
  < /dev/null 2>/dev/null \
  | openssl x509 -outform PEM > intermediate.crt

# Generate pin for intermediate
openssl x509 -in intermediate.crt -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

---

### Step 2: Configure Android

**File:** `android/app/src/main/res/xml/network_security_config.xml`

Replace the placeholder pins with your actual pins:

```xml
<domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">api.sovereigncommunications.app</domain>
    <pin-set expiration="2026-12-31">
        <!-- Replace with your actual primary certificate pin -->
        <pin digest="SHA-256">X3pGTSOuJeEVw989arh53213789asdf1234567890A=</pin>
        <!-- Replace with your actual backup certificate pin -->
        <pin digest="SHA-256">Y4qHTUPvKfFXy098bsi64324890bsdf2345678901B=</pin>
    </pin-set>
    <trust-anchors>
        <certificates src="system" />
    </trust-anchors>
</domain-config>
```

**Important:**
- Uncomment the `<domain-config>` section
- Set expiration date BEFORE your certificate expires
- Always include at least 2 pins (primary + backup)
- Test thoroughly before deploying to production

---

### Step 3: Configure iOS

**File:** `ios/SovereignCommunications/Security/CertificatePinningManager.swift`

Update the `pinnedCertificates` dictionary:

```swift
private let pinnedCertificates: [String: Set<String>] = [
    "api.sovereigncommunications.app": [
        "X3pGTSOuJeEVw989arh53213789asdf1234567890A=", // Primary cert
        "Y4qHTUPvKfFXy098bsi64324890bsdf2345678901B="  // Backup cert
    ],
    "updates.sovereigncommunications.app": [
        "Z5rIUVQwLgGYz109cti75435901ctgh3456789012C=", // Primary cert
        "A6sJVWRxMhHZa210duj86546012duhi4567890123D="  // Backup cert
    ]
]
```

**Important:**
- Keep `isPinningEnabled = true` for production
- Set to `false` only for development/testing
- Test with production certificates before release

---

### Step 4: Configure Web (Server-Side)

While CSP is configured in `index.html`, certificate pinning for web requires server-side configuration.

#### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name api.sovereigncommunications.app;
    
    # SSL Certificate
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Certificate Pinning (HPKP - deprecated but still effective)
    # WARNING: HPKP is deprecated, use with caution
    # Recommended: Use Expect-CT instead
    add_header Public-Key-Pins '
        pin-sha256="X3pGTSOuJeEVw989arh53213789asdf1234567890A=";
        pin-sha256="Y4qHTUPvKfFXy098bsi64324890bsdf2345678901B=";
        max-age=2592000;
        includeSubDomains
    ' always;
    
    # Expect-CT (modern alternative)
    add_header Expect-CT 'max-age=86400, enforce' always;
    
    # HSTS
    add_header Strict-Transport-Security 'max-age=31536000; includeSubDomains' always;
    
    # Other security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

#### Apache Configuration

```apache
<VirtualHost *:443>
    ServerName api.sovereigncommunications.app
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    # Certificate Pinning
    Header always set Public-Key-Pins "pin-sha256=\"X3pGTSOuJeEVw989arh53213789asdf1234567890A=\"; pin-sha256=\"Y4qHTUPvKfFXy098bsi64324890bsdf2345678901B=\"; max-age=2592000; includeSubDomains"
    
    # Expect-CT
    Header always set Expect-CT "max-age=86400, enforce"
    
    # HSTS
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
</VirtualHost>
```

---

## Testing

### Pre-Production Testing

#### Android Testing

1. **Valid Certificate Test:**
   ```bash
   # Install app with production pins
   ./gradlew installRelease
   # Test API calls - should succeed
   ```

2. **Invalid Certificate Test:**
   ```bash
   # Temporarily change one pin to invalid value
   # Install app
   # Test API calls - should fail with cert error
   ```

3. **Debug Build Test:**
   ```bash
   # Debug builds allow user CAs (for Charles Proxy, etc.)
   ./gradlew installDebug
   # Should work with proxy certificates
   ```

#### iOS Testing

1. **Enable Pinning:**
   ```swift
   CertificatePinningManager.shared.isPinningEnabled = true
   ```

2. **Test Valid Certificate:**
   ```swift
   let url = URL(string: "https://api.sovereigncommunications.app/health")!
   let task = session.dataTask(with: url) { data, response, error in
       // Should succeed
   }
   task.resume()
   ```

3. **Test Invalid Certificate:**
   ```swift
   // Change pin to invalid value
   // Request should fail
   ```

4. **Development Mode:**
   ```swift
   #if DEBUG
   CertificatePinningManager.shared.isPinningEnabled = false
   #endif
   ```

#### Web Testing

1. **CSP Test:**
   - Open browser console
   - Check for CSP violations
   - Should see no errors for legitimate resources

2. **Server Header Test:**
   ```bash
   curl -I https://api.sovereigncommunications.app
   # Should see Public-Key-Pins or Expect-CT header
   ```

---

## Certificate Rotation Plan

### Timeline

**3-6 months before expiration:**
1. Generate new certificate
2. Calculate new pin
3. Add new pin as backup to all platforms
4. Deploy updated apps
5. Monitor deployment percentage

**1 month before expiration:**
1. Verify >90% of users have updated app
2. Update server certificate
3. Remove old pin from next app version

**After expiration:**
1. Remove old pin completely
2. Add next rotation's backup pin

### Rotation Checklist

- [ ] Generate new certificate
- [ ] Calculate SHA-256 pin of new certificate
- [ ] Add new pin as backup in Android config
- [ ] Add new pin as backup in iOS config
- [ ] Update server configuration
- [ ] Build and test all platforms
- [ ] Deploy to TestFlight/Google Play Beta
- [ ] Monitor for connection issues
- [ ] After 90% adoption, switch to new certificate
- [ ] Update documentation with new pins
- [ ] Schedule next rotation

---

## Emergency Pin Update

If you need to update pins immediately (e.g., certificate compromise):

### Android

1. Update `network_security_config.xml` with new pins
2. Build emergency release: `./gradlew assembleRelease`
3. Deploy via Google Play (emergency update)
4. Force update via app update API

### iOS

1. Update `CertificatePinningManager.swift` with new pins
2. Build emergency release
3. Submit to App Store (request expedited review)
4. Force update via app update check

### Web

1. Update server headers immediately
2. Deploy new index.html with updated CSP
3. Clear CDN cache
4. No app update needed (updates automatically)

---

## Monitoring

### Metrics to Track

1. **Connection Failures:**
   - Track certificate validation failures
   - Alert on spike in SSL errors
   - Log pin mismatch events

2. **Certificate Expiration:**
   - Monitor certificate expiry dates
   - Alert at 90 days, 30 days, 7 days
   - Automated renewal reminders

3. **Pin Distribution:**
   - Track app version adoption rates
   - Ensure users update before rotation
   - Monitor legacy version usage

### Logging

#### Android

```kotlin
// In your network layer
override fun onReceivedSslError(
    view: WebView?,
    handler: SslErrorHandler?,
    error: SslError?
) {
    Log.e("SSL", "Certificate error: ${error?.primaryError}")
    // Log to analytics
    analyticsService.trackEvent("ssl_error", mapOf(
        "error" to error?.primaryError.toString(),
        "url" to error?.url
    ))
    handler?.cancel()
}
```

#### iOS

```swift
// In CertificatePinningManager
if !isValid {
    // Log to analytics
    Analytics.track("certificate_pin_failure", properties: [
        "domain": domain,
        "expected_pins": pinnedHashes,
        "received_pin": hashBase64
    ])
}
```

---

## Troubleshooting

### Common Issues

#### Issue: App can't connect after pinning enabled

**Cause:** Incorrect pin configuration

**Solution:**
1. Verify pins match production certificate
2. Check domain name matches exactly
3. Ensure certificate is valid (not expired)
4. Temporarily disable pinning to verify server is reachable

#### Issue: Debug builds fail with proxy

**Cause:** Proxy certificates don't match pins

**Solution (Android):**
```xml
<!-- network_security_config.xml already includes debug override -->
<debug-overrides>
    <trust-anchors>
        <certificates src="user" />
    </trust-anchors>
</debug-overrides>
```

**Solution (iOS):**
```swift
#if DEBUG
CertificatePinningManager.shared.isPinningEnabled = false
#endif
```

#### Issue: Pin generation fails

**Cause:** OpenSSL version or certificate format issues

**Solution:**
```bash
# Try alternative method
openssl s_client -connect api.example.com:443 2>&1 < /dev/null | \
  sed -n '/BEGIN/,/END/p' > cert.pem

openssl x509 -in cert.pem -pubkey -noout | \
  openssl pkey -pubin -outform der | \
  openssl dgst -sha256 -binary | \
  base64
```

---

## Security Considerations

### Best Practices

1. **Always pin at least 2 certificates:**
   - Primary (current)
   - Backup (next rotation or intermediate CA)

2. **Set reasonable expiration dates:**
   - Before your certificate expires
   - Leave time for users to update

3. **Monitor certificate expiry:**
   - Set alerts at 90, 30, and 7 days
   - Automate renewal where possible

4. **Test thoroughly:**
   - Test with production certificates
   - Test with invalid certificates
   - Test certificate rotation process

5. **Have a rollback plan:**
   - Keep old pins for at least one release cycle
   - Monitor connection success rates
   - Be ready to disable pinning remotely

### Risks

1. **App Lockout:**
   - Users unable to connect if pins wrong
   - Mitigation: Thorough testing, gradual rollout

2. **Certificate Rotation:**
   - Forgot to update pins before cert expires
   - Mitigation: Automated monitoring and alerts

3. **Emergency Updates:**
   - Need to push update quickly for pin change
   - Mitigation: Emergency update mechanism

---

## References

- [Android Network Security Config](https://developer.android.com/training/articles/security-config)
- [iOS App Transport Security](https://developer.apple.com/documentation/security/preventing_insecure_network_connections)
- [OWASP Certificate Pinning](https://owasp.org/www-community/controls/Certificate_and_Public_Key_Pinning)
- [RFC 7469 - Public Key Pinning](https://tools.ietf.org/html/rfc7469)

---

## Checklist for Production Deployment

- [ ] Generate production certificate pins
- [ ] Update Android network_security_config.xml
- [ ] Update iOS CertificatePinningManager.swift
- [ ] Configure web server headers
- [ ] Test all platforms with production certificates
- [ ] Test with invalid certificates (should fail)
- [ ] Document pin rotation schedule
- [ ] Set up certificate expiry monitoring
- [ ] Configure analytics for pin failures
- [ ] Brief team on emergency procedures
- [ ] Deploy to beta testers first
- [ ] Monitor connection success rates
- [ ] Gradual rollout to production
- [ ] Schedule first rotation review

---

**Status:** Framework implemented, awaiting production certificate configuration  
**Next Action:** Generate production pins and configure before beta release  
**Owner:** DevOps/Security team  
**Documentation:** This guide + inline code comments
