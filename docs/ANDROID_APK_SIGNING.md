# Android APK Signing Setup

This document describes how to set up Android APK signing for automated releases.

## Prerequisites

- A Java keystore file for signing Android apps
- Access to GitHub repository secrets

## Generating a Keystore (if you don't have one)

```bash
keytool -genkey -v -keystore sovereign-communications.keystore \
  -alias sc-release -keyalg RSA -keysize 2048 -validity 10000
```

Follow the prompts to set:
- Keystore password
- Key password
- Your organizational details

## Setting up GitHub Secrets

The build workflow requires the following secrets to be configured in your GitHub repository:

### 1. `ANDROID_SIGNING_KEY`

Base64-encoded keystore file:

```bash
base64 sovereign-communications.keystore > keystore.base64.txt
```

Copy the contents of `keystore.base64.txt` and add it as a secret named `ANDROID_SIGNING_KEY`.

### 2. `ANDROID_KEY_ALIAS`

The alias you used when creating the keystore (e.g., `sc-release`).

### 3. `ANDROID_KEYSTORE_PASSWORD`

The password for the keystore file.

### 4. `ANDROID_KEY_PASSWORD`

The password for the specific key alias.

## Adding Secrets to GitHub

1. Navigate to your repository on GitHub
2. Go to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each of the four secrets listed above

## Building and Releasing

### Automatic Release (on git tag)

```bash
git tag v1.0.0
git push origin v1.0.0
```

This will trigger the workflow and create a GitHub release with the signed APK.

### Manual Build (workflow_dispatch)

1. Go to Actions tab in GitHub
2. Select "Build and Release Android APK" workflow
3. Click "Run workflow"
4. Download the APK from the workflow artifacts

## Verification

After building, you can verify the APK signature:

```bash
jarsigner -verify -verbose -certs app-release.apk
```

## Security Notes

- **Never commit the keystore file to the repository**
- Keep the keystore password secure
- Backup your keystore file - losing it means you can't update your app
- Use different keystores for debug and release builds

## Troubleshooting

### Build fails with "keystore not found"

Ensure `ANDROID_SIGNING_KEY` is properly base64-encoded and contains no newlines.

### Signature verification fails

Check that:
- Key alias matches the one in your keystore
- Passwords are correct
- Keystore file is not corrupted

## Distribution

Once built, the APK is available at:

```
https://github.com/Treystu/SC/releases/latest/download/app-release.apk
```

This URL is used in the webapp for direct APK downloads.
