# Platform Security Best Practices

**Version:** 1.0  
**Date:** 2025-11-18  
**Applies to:** Sovereign Communications V1 Beta

This document provides platform-specific security best practices for developers working on SC across Web, Android, and iOS platforms.

---

## Table of Contents

1. [Web Platform Security](#web-platform-security)
2. [Android Platform Security](#android-platform-security)
3. [iOS Platform Security](#ios-platform-security)
4. [Cross-Platform Security](#cross-platform-security)
5. [Code Review Checklist](#code-review-checklist)

---

## Web Platform Security

### 1. Content Security Policy (CSP)

**Implementation:**

```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' wss:;
  img-src 'self' data: blob:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
">
```

**Key Points:**
- ✅ `default-src 'self'` - Only load resources from same origin
- ✅ `script-src` - No inline scripts or eval()
- ✅ `object-src 'none'` - No Flash or plugins
- ✅ `frame-ancestors 'none'` - Prevent clickjacking
- ✅ `upgrade-insecure-requests` - Force HTTPS

**Testing:**
```javascript
// Check CSP in console
console.log(document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
```

---

### 2. XSS Prevention

**React Best Practices:**

```typescript
// ✅ GOOD - React auto-escapes
function MessageDisplay({ message }: { message: string }) {
  return <div>{message}</div>;
}

// ❌ BAD - Never use dangerouslySetInnerHTML with user content
function BadMessageDisplay({ message }: { message: string }) {
  return <div dangerouslySetInnerHTML={{ __html: message }} />;
}

// ✅ ACCEPTABLE - Only with sanitized content
import DOMPurify from 'dompurify';

function SafeHtmlDisplay({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong'],
    ALLOWED_ATTR: []
  });
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

**Input Validation:**

```typescript
import { validateString, ValidationError } from '@sc/core';

function handleUserInput(input: string): void {
  try {
    const result = validateString(input, {
      minLength: 1,
      maxLength: 1000,
      pattern: /^[a-zA-Z0-9\s\.,!?-]+$/
    });
    
    if (!result.valid) {
      throw new ValidationError(result.error);
    }
    
    // Safe to use
    processMessage(input);
  } catch (error) {
    console.error('Invalid input:', error);
  }
}
```

---

### 3. IndexedDB Security

**Encryption at Rest:**

```typescript
// web/src/storage/encrypted-store.ts
import { encryptMessage, decryptMessage } from '@sc/core';

export class EncryptedStore {
  private db: IDBDatabase;
  private encryptionKey: Uint8Array;

  async storeMessage(id: string, message: Message): Promise<void> {
    // Encrypt before storing
    const plaintext = JSON.stringify(message);
    const nonce = crypto.getRandomValues(new Uint8Array(24));
    const ciphertext = encryptMessage(
      new TextEncoder().encode(plaintext),
      this.encryptionKey,
      nonce
    );

    const tx = this.db.transaction('messages', 'readwrite');
    await tx.objectStore('messages').put({
      id,
      data: ciphertext,
      nonce: nonce
    });
  }

  async retrieveMessage(id: string): Promise<Message | null> {
    const tx = this.db.transaction('messages', 'readonly');
    const record = await tx.objectStore('messages').get(id);
    
    if (!record) return null;

    // Decrypt after retrieving
    const plaintext = decryptMessage(
      record.data,
      this.encryptionKey,
      record.nonce
    );
    
    return JSON.parse(new TextDecoder().decode(plaintext));
  }
}
```

**Key Storage:**

```typescript
// DO NOT store encryption keys in IndexedDB plaintext
// Use SubtleCrypto for key derivation

async function deriveStorageKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('SC-Storage-Salt-V1'), // Use unique salt per user
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
```

---

### 4. Service Worker Security

**Scope Limitation:**

```javascript
// sw.js
const CACHE_NAME = 'sc-v1';
const ALLOWED_ORIGINS = ['https://sovereigncommunications.app'];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only intercept same-origin requests
  if (!ALLOWED_ORIGINS.includes(url.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Prevent service worker from caching sensitive data
const NEVER_CACHE = ['/api/keys', '/api/identity'];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (NEVER_CACHE.some(path => url.pathname.startsWith(path))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // ... cache logic
});
```

---

### 5. WebRTC Security

**ICE Candidate Filtering:**

```typescript
const config: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  iceTransportPolicy: 'all', // or 'relay' for maximum privacy
  iceCandidatePoolSize: 10,
  
  // Prevent IP leakage (optional, reduces connectivity)
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

const pc = new RTCPeerConnection(config);

// Filter ICE candidates to prevent IP leakage (optional)
pc.addEventListener('icecandidate', (event) => {
  if (event.candidate) {
    const { candidate } = event.candidate;
    
    // Filter out local IP addresses if privacy is critical
    if (candidate.includes('192.168.') || candidate.includes('10.')) {
      console.log('Filtered local IP candidate');
      return;
    }
    
    // Send candidate to peer
    sendToPeer(event.candidate);
  }
});
```

**Data Channel Security:**

```typescript
// Always verify peer identity before sending sensitive data
const dc = pc.createDataChannel('messages', {
  ordered: true,
  maxRetransmits: 3
});

dc.addEventListener('open', () => {
  // Verify peer public key before proceeding
  if (!verifyPeerIdentity(peerPublicKey)) {
    dc.close();
    pc.close();
    throw new Error('Peer identity verification failed');
  }
  
  // Now safe to send encrypted messages
  dc.send(encryptedMessage);
});
```

---

## Android Platform Security

### 1. Android Keystore Integration

**Key Generation:**

```kotlin
// Android best practice: Generate keys in Keystore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator

object KeystoreManager {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "sc_identity_key"

    fun generateOrGetKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
            load(null)
        }

        // Check if key exists
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return keyStore.getKey(KEY_ALIAS, null) as SecretKey
        }

        // Generate new key
        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER
        )

        val keySpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            // Require biometric authentication
            .setUserAuthenticationRequired(true)
            .setUserAuthenticationValidityDurationSeconds(30)
            // Use StrongBox if available (hardware security)
            .setIsStrongBoxBacked(true)
            .build()

        keyGenerator.init(keySpec)
        return keyGenerator.generateKey()
    }
}
```

**Key Usage with Biometric:**

```kotlin
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import javax.crypto.Cipher

fun encryptWithBiometric(
    activity: FragmentActivity,
    plaintext: ByteArray,
    onSuccess: (ByteArray) -> Unit,
    onError: (String) -> Unit
) {
    val key = KeystoreManager.generateOrGetKey()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    
    try {
        cipher.init(Cipher.ENCRYPT_MODE, key)
    } catch (e: KeyPermanentlyInvalidatedException) {
        // Biometric changed, key invalidated
        onError("Biometric credentials changed. Please re-setup.")
        return
    }

    val executor = ContextCompat.getMainExecutor(activity)
    val biometricPrompt = BiometricPrompt(activity, executor,
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(
                result: BiometricPrompt.AuthenticationResult
            ) {
                val cryptoObject = result.cryptoObject
                val ciphertext = cryptoObject?.cipher?.doFinal(plaintext)
                ciphertext?.let { onSuccess(it) }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                onError(errString.toString())
            }
        }
    )

    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle("Authenticate")
        .setSubtitle("Unlock your identity key")
        .setNegativeButtonText("Cancel")
        .build()

    biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
}
```

---

### 2. SQLCipher Database Encryption

**Implementation:**

```kotlin
// app/build.gradle.kts
dependencies {
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")
    implementation("androidx.sqlite:sqlite:2.4.0")
}
```

```kotlin
// SCDatabase.kt
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory

object SCDatabase {
    fun getDatabase(context: Context): SCDatabase {
        val passphrase = getOrCreateDatabasePassphrase(context)
        val factory = SupportFactory(passphrase)
        
        return Room.databaseBuilder(
            context.applicationContext,
            SCDatabase::class.java,
            "sovereign_communications_db"
        )
            .openHelperFactory(factory)
            .build()
    }

    private fun getOrCreateDatabasePassphrase(context: Context): ByteArray {
        val prefs = context.getSharedPreferences("sc_secure", Context.MODE_PRIVATE)
        val encryptedPassphrase = prefs.getString("db_passphrase", null)

        if (encryptedPassphrase != null) {
            // Decrypt with Keystore key
            return decryptPassphrase(encryptedPassphrase)
        }

        // Generate new passphrase
        val passphrase = ByteArray(32)
        SecureRandom().nextBytes(passphrase)
        
        // Encrypt with Keystore key and store
        val encrypted = encryptPassphrase(passphrase)
        prefs.edit().putString("db_passphrase", encrypted).apply()
        
        return passphrase
    }

    private fun encryptPassphrase(passphrase: ByteArray): String {
        val key = KeystoreManager.generateOrGetKey()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key)
        
        val ciphertext = cipher.doFinal(passphrase)
        val iv = cipher.iv
        
        // Combine IV + ciphertext
        val combined = ByteArray(iv.size + ciphertext.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ciphertext, 0, combined, iv.size, ciphertext.size)
        
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }
}
```

---

### 3. ProGuard/R8 Configuration

**Security-focused ProGuard rules:**

```proguard
# proguard-rules.pro

# Keep cryptographic classes
-keep class com.sovereign.communications.crypto.** { *; }
-keep class org.bouncycastle.** { *; }

# Obfuscate everything else
-repackageclasses ''
-allowaccessmodification

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Don't obfuscate stack traces
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Optimize
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5

# Remove unused code
-assumenosideeffects class kotlin.jvm.internal.Intrinsics {
    public static void check*(...);
    public static void throw*(...);
}
```

---

### 4. Secure Intent Handling

**Avoid Intent hijacking:**

```kotlin
// ❌ BAD - Implicit intent
val intent = Intent("com.sovereign.communications.SEND_MESSAGE")
intent.putExtra("message", sensitiveData) // Can be intercepted!
startActivity(intent)

// ✅ GOOD - Explicit intent
val intent = Intent(this, MessageActivity::class.java)
intent.putExtra("message", sensitiveData)
startActivity(intent)

// ✅ BETTER - Encrypt sensitive data in intents
val encrypted = encryptForIntent(sensitiveData)
intent.putExtra("encrypted_message", encrypted)
startActivity(intent)
```

**Validate incoming intents:**

```kotlin
override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    
    // Verify intent comes from our app
    if (intent?.component?.packageName != packageName) {
        Log.w(TAG, "Intent from untrusted package")
        return
    }
    
    // Validate intent data
    val data = intent.getStringExtra("message")
    if (data != null && validateMessageData(data)) {
        processMessage(data)
    }
}
```

---

### 5. Network Security Configuration

**res/xml/network_security_config.xml:**

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Prevent cleartext traffic -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Certificate pinning for update server -->
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.sovereigncommunications.app</domain>
        <pin-set expiration="2026-01-01">
            <!-- Leaf certificate pin -->
            <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>
            <!-- Intermediate certificate pin (backup) -->
            <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>
        </pin-set>
    </domain-config>

    <!-- Debug configuration (debug builds only) -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

**AndroidManifest.xml:**

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
</application>
```

---

### 6. Root Detection

```kotlin
object RootDetection {
    fun isDeviceRooted(): Boolean {
        return checkBuildTags() ||
               checkSuBinary() ||
               checkRootApps() ||
               checkRootPermissions()
    }

    private fun checkBuildTags(): Boolean {
        val buildTags = Build.TAGS
        return buildTags != null && buildTags.contains("test-keys")
    }

    private fun checkSuBinary(): Boolean {
        val paths = arrayOf(
            "/system/app/Superuser.apk",
            "/sbin/su",
            "/system/bin/su",
            "/system/xbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/su/bin/su"
        )

        return paths.any { File(it).exists() }
    }

    private fun checkRootApps(): Boolean {
        val packages = arrayOf(
            "com.noshufou.android.su",
            "com.thirdparty.superuser",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.zachspong.temprootremovejb",
            "com.ramdroid.appquarantine"
        )

        val pm = context.packageManager
        return packages.any {
            try {
                pm.getPackageInfo(it, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    private fun checkRootPermissions(): Boolean {
        return try {
            Runtime.getRuntime().exec("su")
            true
        } catch (e: IOException) {
            false
        }
    }
}

// Usage
if (RootDetection.isDeviceRooted()) {
    showWarningDialog("Rooted device detected. Security may be compromised.")
}
```

---

## iOS Platform Security

### 1. Keychain Best Practices

**Secure Key Storage:**

```swift
// Enhanced KeychainManager with biometric protection
extension KeychainManager {
    /// Store key with biometric authentication requirement
    func storeKeyWithBiometric(
        _ key: Data,
        identifier: String,
        prompt: String = "Authenticate to access key"
    ) throws {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "key_\(identifier)",
            kSecValueData as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        
        // Add biometric authentication requirement
        if #available(iOS 11.3, *) {
            let access = SecAccessControlCreateWithFlags(
                nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                [.biometryCurrentSet, .privateKeyUsage],
                nil
            )
            
            if let access = access {
                query[kSecAttrAccessControl as String] = access
                query[kSecUseAuthenticationContext as String] = LAContext()
            }
        }
        
        // Delete existing
        try? delete(key: "key_\(identifier)")
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
    }
    
    /// Retrieve key with biometric authentication
    func retrieveKeyWithBiometric(
        identifier: String,
        prompt: String = "Authenticate to access key"
    ) throws -> Data? {
        let context = LAContext()
        context.localizedReason = prompt
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "key_\(identifier)",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseAuthenticationContext as String: context
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecItemNotFound {
            return nil
        }
        
        guard status == errSecSuccess else {
            throw KeychainError.unhandledError(status: status)
        }
        
        return result as? Data
    }
}
```

---

### 2. Core Data Security

**Encryption at Rest:**

```swift
// CoreDataStack.swift
import CoreData

class CoreDataStack {
    static let shared = CoreDataStack()
    
    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "SovereignCommunications")
        
        // Configure encryption
        let storeDescription = container.persistentStoreDescriptions.first
        storeDescription?.setOption(
            FileProtectionType.complete as NSObject,
            forKey: NSPersistentStoreFileProtectionKey
        )
        
        // Prevent backups for sensitive data
        storeDescription?.setOption(
            true as NSObject,
            forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey
        )
        
        container.loadPersistentStores { description, error in
            if let error = error {
                fatalError("Core Data store failed to load: \(error)")
            }
        }
        
        // Enable automatic merging
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        
        return container
    }()
    
    func saveContext() {
        let context = persistentContainer.viewContext
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                let nsError = error as NSError
                fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
            }
        }
    }
}
```

**Exclude from Backup:**

```swift
// Exclude specific files from iCloud backup
func excludeFromBackup(url: URL) throws {
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    
    var url = url
    try url.setResourceValues(resourceValues)
}

// Usage
let storeURL = CoreDataStack.shared.persistentContainer
    .persistentStoreDescriptions.first?.url

if let url = storeURL {
    try? excludeFromBackup(url: url)
}
```

---

### 3. App Transport Security (ATS)

**Info.plist configuration:**

```xml
<!-- Info.plist -->
<key>NSAppTransportSecurity</key>
<dict>
    <!-- Require ATS for all connections -->
    <key>NSAllowsArbitraryLoads</key>
    <false/>
    
    <!-- Exception for local development only -->
    <key>NSAllowsLocalNetworking</key>
    <true/>
    
    <!-- Specific domain configuration (if needed) -->
    <key>NSExceptionDomains</key>
    <dict>
        <key>api.sovereigncommunications.app</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSRequiresCertificateTransparency</key>
            <true/>
            <key>NSExceptionMinimumTLSVersion</key>
            <string>TLSv1.3</string>
        </dict>
    </dict>
</dict>
```

---

### 4. Jailbreak Detection

```swift
import UIKit

class JailbreakDetection {
    static func isJailbroken() -> Bool {
        return checkSuspiciousFiles() ||
               checkSuspiciousApps() ||
               checkFork() ||
               checkSymlinks() ||
               checkWritePermissions()
    }
    
    private static func checkSuspiciousFiles() -> Bool {
        let paths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/private/var/lib/apt/",
            "/Applications/blackra1n.app",
            "/Applications/FakeCarrier.app",
            "/Applications/Icy.app",
            "/Applications/IntelliScreen.app",
            "/Applications/MxTube.app",
            "/Applications/RockApp.app",
            "/Applications/SBSettings.app",
            "/Applications/WinterBoard.app",
            "/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist",
            "/Library/MobileSubstrate/DynamicLibraries/Veency.plist",
            "/private/var/lib/cydia",
            "/private/var/mobile/Library/SBSettings/Themes",
            "/private/var/stash",
            "/private/var/tmp/cydia.log",
            "/System/Library/LaunchDaemons/com.ikey.bbot.plist",
            "/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist",
            "/usr/bin/sshd",
            "/usr/libexec/sftp-server",
            "/usr/sbin/frida-server",
            "/usr/bin/cycript",
            "/usr/local/bin/cycript",
            "/usr/lib/libcycript.dylib",
            "/var/cache/apt",
            "/var/lib/cydia",
            "/var/log/syslog"
        ]
        
        return paths.contains { FileManager.default.fileExists(atPath: $0) }
    }
    
    private static func checkSuspiciousApps() -> Bool {
        let schemes = [
            "cydia://package/com.example.package",
            "undecimus://",
            "sileo://",
            "zbra://",
            "filza://"
        ]
        
        return schemes.contains { UIApplication.shared.canOpenURL(URL(string: $0)!) }
    }
    
    private static func checkFork() -> Bool {
        // fork() shouldn't be available on non-jailbroken devices
        let result = fork()
        if result >= 0 {
            if result > 0 {
                // Parent process
                kill(result, SIGTERM)
            }
            return true
        }
        return false
    }
    
    private static func checkSymlinks() -> Bool {
        let path = "/Applications"
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: path)
            if let type = attributes[.type] as? FileAttributeType,
               type == .typeSymbolicLink {
                return true
            }
        } catch {
            // Can't read attributes
        }
        return false
    }
    
    private static func checkWritePermissions() -> Bool {
        let testPath = "/private/jailbreak.txt"
        do {
            try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(atPath: testPath)
            return true
        } catch {
            return false
        }
    }
}

// Usage
if JailbreakDetection.isJailbroken() {
    showAlert(
        title: "Security Warning",
        message: "Jailbroken device detected. App security may be compromised."
    )
}
```

---

### 5. Background Privacy Protection

```swift
// AppDelegate.swift or SceneDelegate.swift

func sceneWillResignActive(_ scene: UIScene) {
    // Add privacy overlay when app goes to background
    if let windowScene = scene as? UIWindowScene,
       let window = windowScene.windows.first {
        addPrivacyOverlay(to: window)
    }
}

func sceneDidBecomeActive(_ scene: UIScene) {
    // Remove privacy overlay when app becomes active
    if let windowScene = scene as? UIWindowScene,
       let window = windowScene.windows.first {
        removePrivacyOverlay(from: window)
    }
}

private func addPrivacyOverlay(to window: UIWindow) {
    let blurEffect = UIBlurEffect(style: .systemUltraThinMaterial)
    let blurView = UIVisualEffectView(effect: blurEffect)
    blurView.frame = window.bounds
    blurView.tag = 999 // Tag for easy removal
    blurView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    
    window.addSubview(blurView)
}

private func removePrivacyOverlay(from window: UIWindow) {
    window.viewWithTag(999)?.removeFromSuperview()
}
```

---

### 6. Screenshot Prevention

```swift
// Prevent screenshots on sensitive screens
class SecureViewController: UIViewController {
    private var secureView: UIView?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        preventScreenCapture()
    }
    
    private func preventScreenCapture() {
        // Add a secure field (makes iOS blur the screen in app switcher)
        let secureTextField = UITextField()
        secureTextField.isSecureTextEntry = true
        secureTextField.isHidden = true
        secureTextField.isUserInteractionEnabled = false
        view.addSubview(secureTextField)
        view.layer.superlayer?.addSublayer(secureTextField.layer)
        secureTextField.layer.sublayers?.first?.addSublayer(view.layer)
        
        secureView = secureTextField
    }
    
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        secureView?.removeFromSuperview()
    }
}
```

---

## Cross-Platform Security

### 1. Cryptographic Key Lifecycle

**Generation:**
```
Web: crypto.getRandomValues() → @noble/curves
Android: SecureRandom → KeyStore → BouncyCastle
iOS: SecRandomCopyBytes() → Keychain → Swift Crypto
```

**Storage:**
```
Web: IndexedDB (encrypted with derived key)
Android: Android Keystore (hardware-backed)
iOS: Keychain (Secure Enclave)
```

**Usage:**
```
All platforms: @sc/core library (consistent API)
- Ed25519 signing
- X25519 key exchange
- XChaCha20-Poly1305 encryption
```

**Rotation:**
```
All platforms: Automatic every 1000 messages or 24 hours
- Derive new session key
- Securely delete old key
- Update peer state
```

**Deletion:**
```
Web: Clear IndexedDB + overwrite memory
Android: KeyStore.deleteEntry() + clear preferences
iOS: Keychain delete + FileManager secure delete
```

---

### 2. Input Validation

**Universal validation layer (@sc/core):**

```typescript
// All platforms use this
import { validateMessage, ValidationError } from '@sc/core';

function processIncomingMessage(data: unknown): void {
  try {
    const result = validateMessage(data);
    
    if (!result.valid) {
      throw new ValidationError(result.error);
    }
    
    const message = result.value;
    
    // Safe to process
    handleMessage(message);
    
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error('Validation failed:', error.message);
      // Don't process invalid messages
    } else {
      throw error;
    }
  }
}
```

---

### 3. Rate Limiting

**Consistent across platforms:**

```typescript
// @sc/core rate limiting
import { RateLimiter } from '@sc/core';

const messageLimiter = new RateLimiter({
  algorithm: 'token-bucket',
  capacity: 100,
  refillRate: 100 / 60 // 100 messages per minute
});

function handleIncomingMessage(peerId: string, message: Message): void {
  if (!messageLimiter.tryConsume(peerId, 1)) {
    console.warn(`Rate limit exceeded for peer ${peerId}`);
    // Optionally blacklist peer
    blacklistPeer(peerId, 300000); // 5 minutes
    return;
  }
  
  processMessage(message);
}
```

---

## Code Review Checklist

### Security Checklist for Pull Requests

#### Cryptography
- [ ] No custom crypto implementations
- [ ] Using audited libraries (@noble/*, platform APIs)
- [ ] Keys generated with secure randomness
- [ ] No hardcoded keys or secrets
- [ ] Timing-safe comparisons for secrets
- [ ] Nonce reuse prevention
- [ ] Key rotation implemented

#### Input Validation
- [ ] All external data validated
- [ ] Length limits enforced
- [ ] Type checking performed
- [ ] No SQL injection vectors
- [ ] No XSS vulnerabilities
- [ ] Protocol version checked

#### Data Storage
- [ ] Sensitive data encrypted at rest
- [ ] Keys stored in platform secure storage
- [ ] Database encrypted (Android SQLCipher, iOS FileProtection)
- [ ] No sensitive data in logs
- [ ] Backup settings appropriate

#### Network Security
- [ ] HTTPS/TLS required
- [ ] Certificate validation enabled
- [ ] No cleartext traffic
- [ ] WebRTC security configured
- [ ] Rate limiting implemented

#### Platform-Specific
- [ ] **Web:** CSP configured, no eval(), XSS prevention
- [ ] **Android:** ProGuard enabled, Keystore used, root detection
- [ ] **iOS:** ATS enabled, Keychain used, jailbreak detection

#### Code Quality
- [ ] No commented-out code
- [ ] Error handling appropriate
- [ ] Security warnings documented
- [ ] Tests cover security scenarios
- [ ] Documentation updated

---

## Security Contacts

**Internal:**
- Security Team: security@internal
- Security Lead: [Name]

**External:**
- Security Advisories: https://github.com/Treystu/SC/security/advisories
- Bug Bounty: [To be announced]

**Reporting:**
- Email: security@sovereigncommunications.app
- PGP Key: [To be published]

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-18  
**Next Review:** Quarterly or after major platform changes

---

**Remember:** Security is a continuous process, not a one-time checklist. Stay vigilant!
