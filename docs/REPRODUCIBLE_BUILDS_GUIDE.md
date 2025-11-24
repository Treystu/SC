# Reproducible Builds Guide

**Version:** 1.0  
**Last Updated:** 2025-11-18  
**Status:** Implementation Guide

## Overview

Reproducible (deterministic) builds allow independent verification that published binaries match the source code. This is critical for security and trust in decentralized applications.

### Benefits

- **Verify Integrity**: Users can verify official binaries weren't tampered with
- **Supply Chain Security**: Detect malicious code injection in build pipeline
- **Trust Without Central Authority**: Community can independently verify builds
- **Audit Trail**: Cryptographic proof that binary matches specific commit

### Current Status

| Platform | Status | Priority |
|----------|--------|----------|
| Core (TypeScript) | ⚠️ Non-deterministic | High |
| Web | ⚠️ Non-deterministic | High |
| Android | ⚠️ Non-deterministic | Medium |
| iOS | ⚠️ Non-deterministic | Low |

---

## Web Application (Vite + React)

### Sources of Non-Determinism

1. **Timestamps**: Build timestamps embedded in output
2. **File Order**: Inconsistent file processing order
3. **Hash Generation**: Non-deterministic chunking
4. **Environment Variables**: Build-time environment differences
5. **Node Modules**: Different installation order

### Implementation Steps

#### 1. Configure Vite for Determinism

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  build: {
    // Use fixed timestamps
    rollupOptions: {
      output: {
        // Deterministic chunk names
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        
        // Sort modules for consistency
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
      
      // Plugin for fixed timestamps
      plugins: [
        {
          name: 'deterministic-build',
          generateBundle(options, bundle) {
            // Remove timestamps from source maps
            for (const fileName in bundle) {
              const chunk = bundle[fileName];
              if (chunk.type === 'chunk' && chunk.map) {
                delete chunk.map.sourcesContent;
              }
            }
          },
        },
      ],
    },
    
    // Fixed source map generation
    sourcemap: true,
  },
  
  // Fixed environment
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.BUILD_TIME': JSON.stringify(
      process.env.SOURCE_DATE_EPOCH 
        ? new Date(parseInt(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
        : new Date('2025-01-01T00:00:00Z').toISOString()
    ),
  },
});
```

#### 2. Lock Dependencies

```bash
# Use exact versions in package-lock.json
npm ci --prefer-offline

# Verify lock file hasn't changed
git diff --exit-code package-lock.json
```

#### 3. Set SOURCE_DATE_EPOCH

```bash
# .github/workflows/build.yml
env:
  SOURCE_DATE_EPOCH: $(git log -1 --pretty=%ct)

# Or use fixed timestamp for release
export SOURCE_DATE_EPOCH=1704067200  # 2024-01-01 00:00:00 UTC
```

#### 4. Build Script

```bash
#!/bin/bash
# scripts/reproducible-build.sh

set -e

# Get commit timestamp
export SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)

# Clean build
rm -rf dist node_modules/.cache

# Install exact dependencies
npm ci --prefer-offline

# Build with fixed environment
NODE_ENV=production npm run build

# Generate checksums
cd dist
find . -type f | sort | xargs sha256sum > SHA256SUMS
cd ..

# Create tarball with deterministic options
tar --sort=name \
    --mtime="@${SOURCE_DATE_EPOCH}" \
    --owner=0 --group=0 --numeric-owner \
    --pax-option=exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime \
    -czf sovereign-communications-web-${VERSION}.tar.gz dist/

# Sign checksums
gpg --armor --detach-sign dist/SHA256SUMS
```

---

## Android Application (Gradle + Kotlin)

### Sources of Non-Determinism

1. **Build Timestamps**: Embedded in APK
2. **Resource Ordering**: XML processing order
3. **ZIP Alignment**: Padding bytes
4. **Signing**: Timestamp in signature
5. **Build Tools Versions**: Different tool behavior

### Implementation Steps

#### 1. Configure Gradle

```kotlin
// android/app/build.gradle.kts

android {
    compileSdk = 34
    
    defaultConfig {
        // ... existing config
        
        // Deterministic build timestamp
        val buildTime = System.getenv("SOURCE_DATE_EPOCH")?.toLongOrNull()
            ?.times(1000) ?: 1704067200000L
        buildConfigField("long", "BUILD_TIMESTAMP", "${buildTime}L")
    }
    
    buildTypes {
        release {
            // Reproducible ProGuard
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            
            // Fixed signing config timestamp
            signingConfig = signingConfigs.getByName("release")
        }
    }
    
    // Deterministic packaging
    packagingOptions {
        // Exclude timestamps from native libs
        jniLibs {
            pickFirsts.add("**/*.so")
        }
    }
}

// Reproducible ProGuard
tasks.whenTaskAdded {
    if (name.startsWith("minify") || name.startsWith("shrink")) {
        outputs.upToDateWhen { false }
    }
}
```

#### 2. Gradle Properties

```properties
# gradle.properties

# Reproducible builds
org.gradle.caching=true
org.gradle.parallel=true
org.gradle.configureondemand=false

# Fixed Java/Kotlin versions
kotlin.version=1.9.20
```

#### 3. Build Script

```bash
#!/bin/bash
# android/reproducible-build.sh

set -e

# Get commit timestamp
export SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)

# Clean build
./gradlew clean

# Build release APK
./gradlew assembleRelease \
    -Porg.gradle.caching=false \
    -Porg.gradle.daemon=false

# Strip non-deterministic data from APK
apktool d app/build/outputs/apk/release/app-release.apk -o apk-decoded
# Edit AndroidManifest.xml to remove timestamps
apktool b apk-decoded -o app-release-stripped.apk

# Generate checksums
sha256sum app-release-stripped.apk > app-release.sha256

# Sign with reproducible signature
apksigner sign \
    --ks release.keystore \
    --ks-pass env:KEYSTORE_PASS \
    app-release-stripped.apk
```

---

## Core Library (TypeScript)

### Implementation

```typescript
// rollup.config.js
export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true,
    
    // Deterministic banner
    banner: `/**
 * Sovereign Communications Core
 * Version: ${process.env.VERSION}
 * Commit: ${process.env.GIT_COMMIT}
 * Built: ${new Date(parseInt(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()}
 */`,
  },
  
  plugins: [
    typescript({
      // Fixed configuration
      tsconfig: './tsconfig.json',
    }),
  ],
};
```

---

## iOS Application (Swift)

### Sources of Non-Determinism

1. **Build Timestamps**
2. **UUID Generation**
3. **Code Signing Timestamps**
4. **Swift Compilation Order**

### Implementation Steps

#### 1. Xcode Build Settings

```bash
# Set in Xcode or via command line

# Deterministic build timestamp
SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)

# Build
xcodebuild \
    -scheme SovereignCommunications \
    -configuration Release \
    -archivePath build/SC.xcarchive \
    archive \
    OTHER_SWIFT_FLAGS="-D REPRODUCIBLE_BUILD" \
    CURRENT_PROJECT_VERSION=${SOURCE_DATE_EPOCH}
```

#### 2. Info.plist Configuration

```xml
<!-- ios/SovereignCommunications/Info.plist -->
<key>CFBundleVersion</key>
<string>$(SOURCE_DATE_EPOCH)</string>
```

---

## Verification Process

### 1. Independent Build

```bash
# Clone repository
git clone https://github.com/Treystu/SC.git
cd SC
git checkout v1.0.0  # Specific release tag

# Build (see platform-specific scripts above)
./scripts/reproducible-build-web.sh

# Compare checksums
sha256sum -c dist/SHA256SUMS
```

### 2. Automated Verification

```yaml
# .github/workflows/verify-reproducible.yml
name: Verify Reproducible Build

on:
  release:
    types: [published]

jobs:
  verify-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.release.tag_name }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build
        env:
          SOURCE_DATE_EPOCH: $(git log -1 --pretty=%ct)
        run: |
          cd web
          npm ci
          npm run build
          cd dist
          find . -type f | sort | xargs sha256sum > SHA256SUMS
      
      - name: Download official release
        run: |
          wget https://github.com/Treystu/SC/releases/download/${{ github.event.release.tag_name }}/sovereign-communications-web-${{ github.event.release.tag_name }}.tar.gz
          tar xzf sovereign-communications-web-${{ github.event.release.tag_name }}.tar.gz
      
      - name: Compare checksums
        run: |
          diff web/dist/SHA256SUMS dist/SHA256SUMS
          if [ $? -eq 0 ]; then
            echo "✅ Build is reproducible!"
          else
            echo "❌ Build is NOT reproducible!"
            exit 1
          fi
```

---

## Publishing Checksums

### Release Checklist

```markdown
- [ ] Tag release: `git tag -s v1.0.0 -m "Version 1.0.0"`
- [ ] Build reproducibly with scripts above
- [ ] Generate SHA256SUMS for all platforms
- [ ] Sign checksums with GPG: `gpg --armor --detach-sign SHA256SUMS`
- [ ] Publish to GitHub releases:
  - Source code (automatic)
  - Built artifacts (.tar.gz, .apk, .ipa)
  - SHA256SUMS
  - SHA256SUMS.asc (signature)
  - BUILD_INFO.txt (instructions)
- [ ] Update website with checksums
- [ ] Verify build independently
```

### BUILD_INFO.txt Template

```
Sovereign Communications v1.0.0
Reproducible Build Information

COMMIT: abc123def456...
TAG: v1.0.0
SOURCE_DATE_EPOCH: 1704067200
BUILD_DATE: 2024-01-01T00:00:00Z

CHECKSUMS (SHA256):
Web:     1234567890abcdef...
Android: 234567890abcdef1...
iOS:     34567890abcdef12...

VERIFICATION:
1. Clone repository: git clone https://github.com/Treystu/SC.git
2. Checkout tag: git checkout v1.0.0
3. Build: ./scripts/reproducible-build-<platform>.sh
4. Compare: sha256sum -c SHA256SUMS

GPG SIGNATURE:
Verify with: gpg --verify SHA256SUMS.asc SHA256SUMS

GPG KEY:
4096R/ABCD1234 Sovereign Communications Release Signing Key
Fingerprint: 1234 5678 9ABC DEF0 1234  5678 9ABC DEF0 ABCD 1234
```

---

## Challenges and Limitations

### Known Issues

1. **Node.js Versions**: Different Node versions may produce different output
   - **Solution**: Lock Node version in CI and documentation
   
2. **Time Zones**: System timezone affects builds
   - **Solution**: Always use UTC (`TZ=UTC`)
   
3. **File System**: Different file systems have different sorting
   - **Solution**: Explicit sorting in build scripts
   
4. **Cache**: Build caches can cause inconsistencies
   - **Solution**: Clean builds with `--no-cache` flags

5. **Native Dependencies**: Different CPU architectures
   - **Solution**: Document required build architecture

### Platform-Specific Challenges

**Android:**
- ProGuard non-determinism (partially solved in R8)
- APK signing includes timestamp (can be normalized)
- Resource compilation order

**iOS:**
- Xcode version sensitivity
- Code signing certificates
- Swift compilation non-determinism

**Web:**
- Webpack/Vite chunking algorithms
- Babel/SWC transformations
- Tree shaking variations

---

## Future Improvements

### V1.1 Goals

- [ ] Fully reproducible web builds (90% confidence)
- [ ] Document Android reproducibility process
- [ ] Automated verification in CI
- [ ] Community verification instructions

### V1.5 Goals

- [ ] Reproducible Android APKs
- [ ] Third-party verification service
- [ ] Build provenance (SLSA Level 3)
- [ ] Binary transparency log

### V2.0 Goals

- [ ] Reproducible iOS builds
- [ ] Multi-party build verification
- [ ] Automated canary builds
- [ ] In-app verification UI

---

## Resources

- [Reproducible Builds Project](https://reproducible-builds.org/)
- [Debian Reproducible Builds](https://wiki.debian.org/ReproducibleBuilds)
- [SOURCE_DATE_EPOCH Specification](https://reproducible-builds.org/specs/source-date-epoch/)
- [F-Droid Reproducible Builds](https://f-droid.org/en/docs/Reproducible_Builds/)
- [SLSA Framework](https://slsa.dev/)

---

**Document Control**

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-18 | Initial guide | Security Team |

**Review Schedule**: Quarterly  
**Next Review**: 2026-02-18
