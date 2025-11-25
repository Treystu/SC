# Android Build Setup Guide

## Prerequisites

- **Android Studio**: Arctic Fox (2020.3.1) or later
- **JDK**: 17 or later
- **Android SDK**: API Level 26 (Android 8.0) or higher
- **Gradle**: 8.9 (included via wrapper)

## Quick Setup

### 1. Install Android SDK

**Option A: Via Android Studio (Recommended)**
1. Download and install [Android Studio](https://developer.android.com/studio)
2. Open Android Studio
3. Go to **Tools → SDK Manager**
4. Install:
   - Android SDK Platform 34
   - Android SDK Build-Tools 34.0.0
   - Android SDK Platform-Tools
   - Android SDK Tools

**Option B: Command Line Tools Only**
1. Download [Android Command Line Tools](https://developer.android.com/studio#command-tools)
2. Extract to a directory (e.g., `~/Android/Sdk`)
3. Set `ANDROID_HOME` environment variable

### 2. Configure SDK Location

**Option A: Environment Variable (Recommended for CI/CD)**
```bash
# Add to ~/.zshrc or ~/.bash_profile
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
```

**Option B: local.properties File (Recommended for Local Development)**
Create `android/local.properties`:
```properties
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
```

**Common SDK Locations:**
- **macOS**: `/Users/USERNAME/Library/Android/sdk`
- **Linux**: `/home/USERNAME/Android/Sdk`
- **Windows**: `C:\\Users\\USERNAME\\AppData\\Local\\Android\\Sdk`

### 3. Verify Setup

```bash
cd android
./gradlew build
```

If successful, you should see:
```
BUILD SUCCESSFUL in XXs
```

## Build Commands

### Debug Build
```bash
cd android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Release Build
```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

### Install on Device
```bash
cd android
./gradlew installDebug
```

### Run Tests
```bash
cd android
./gradlew test
```

### Run Instrumentation Tests
```bash
cd android
./gradlew connectedAndroidTest
```

## Troubleshooting

### Error: "SDK location not found"
**Solution**: Set `ANDROID_HOME` or create `local.properties` file (see step 2 above)

### Error: "Could not find or load main class org.gradle.wrapper.GradleWrapperMain"
**Solution**: The Gradle wrapper JAR is missing or corrupted
```bash
cd android
curl -o gradle/wrapper/gradle-wrapper.jar https://raw.githubusercontent.com/gradle/gradle/v8.9.0/gradle/wrapper/gradle-wrapper.jar
```

### Error: "Minimum supported Gradle version is X.X"
**Solution**: Update `gradle/wrapper/gradle-wrapper.properties`:
```properties
distributionUrl=https\://services.gradle.org/distributions/gradle-8.9-bin.zip
```

### Error: "Plugin [id: 'org.jetbrains.kotlin.plugin.compose'] was not found"
**Solution**: This is already configured in the project. Ensure you're using Kotlin 2.0.21+

### Error: "Cannot resolve external dependency"
**Solution**: Check internet connection and repository configuration in `settings.gradle`

## Project Structure

```
android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/sovereign/communications/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── ble/              # BLE mesh networking
│   │   │   │   ├── crypto/           # Cryptographic operations
│   │   │   │   ├── db/               # Room database
│   │   │   │   └── ui/               # Jetpack Compose UI
│   │   │   ├── AndroidManifest.xml
│   │   │   └── res/
│   │   └── test/                     # Unit tests
│   └── build.gradle                  # App-level build config
├── build.gradle                      # Project-level build config
├── settings.gradle                   # Project settings
└── gradle/
    └── wrapper/
        ├── gradle-wrapper.jar
        └── gradle-wrapper.properties
```

## Dependencies

### Core Dependencies
- **Kotlin**: 2.0.21
- **Jetpack Compose**: 1.7.5
- **Room Database**: 2.6.1
- **WebRTC**: 1.3.10
- **Coroutines**: 1.10.2
- **Lazysodium**: 5.2.0 (for cryptography)

### Build Tools
- **Android Gradle Plugin**: 8.7.3
- **Kotlin Gradle Plugin**: 2.0.21
- **Compose Compiler Plugin**: 2.0.21

## CI/CD Configuration

### GitHub Actions

Add Android SDK to your CI workflow:

```yaml
- name: Set up JDK 17
  uses: actions/setup-java@v3
  with:
    java-version: '17'
    distribution: 'temurin'

- name: Setup Android SDK
  uses: android-actions/setup-android@v2

- name: Build Android
  run: |
    cd android
    ./gradlew assembleDebug
```

### Environment Variables for CI

```yaml
env:
  ANDROID_HOME: /usr/local/lib/android/sdk
```

## Development Tips

### 1. Use Android Studio for Development
- Better code completion
- Built-in emulator
- Debugging tools
- Layout inspector

### 2. Enable Gradle Daemon
Add to `~/.gradle/gradle.properties`:
```properties
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
```

### 3. Use Build Variants
```bash
# Debug build (faster, includes debug symbols)
./gradlew assembleDebug

# Release build (optimized, minified)
./gradlew assembleRelease
```

### 4. Clear Build Cache
```bash
cd android
./gradlew clean
rm -rf .gradle build app/build
```

## Next Steps

1. **Run on Emulator**: Open Android Studio → AVD Manager → Create Virtual Device
2. **Run on Device**: Enable USB Debugging on your Android device
3. **Test BLE**: BLE features require a physical device (not available in emulator)
4. **Background Services**: Test background sync and notifications

## Resources

- [Android Developer Documentation](https://developer.android.com/docs)
- [Jetpack Compose Documentation](https://developer.android.com/jetpack/compose)
- [Kotlin Documentation](https://kotlinlang.org/docs/home.html)
- [Gradle Documentation](https://docs.gradle.org/)

---

**Last Updated**: 2025-11-25
**Gradle Version**: 8.9
**Android Gradle Plugin**: 8.7.3
**Kotlin Version**: 2.0.21
