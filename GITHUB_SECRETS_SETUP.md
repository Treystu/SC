# Android APK Signing - GitHub Secrets Setup

## 📋 Quick Answer: Where to Add Secrets?

**Add secrets to BOTH GitHub Environments:**

1. Go to: **Settings** → **Environments**
2. Create two environments: `staging` and `production`
3. Add the 4 secrets below to **BOTH** environments

**Why both?** 
- `staging` - For testing builds (tags like `staging-v1.0.0-beta.1`)
- `production` - For public releases (tags like `v1.0.0`)

---

## 🌍 Environment Configuration

The secrets need to be added to **GitHub Environments**, not just repository secrets. This allows you to have different signing keys for staging and production.

### Recommended Setup:

1. **Staging Environment** - For testing and development
   - Used for branch builds and staging releases
   - Tag format: `staging-v1.0.0-beta.1`
   
2. **Production Environment** - For public releases
   - Used for production releases only
   - Tag format: `v1.0.0`

---

## ✅ Keystore Generated Successfully!

A new Android keystore has been generated for Sovereign Communications with the following details:

## 📋 GitHub Secrets to Configure

Add these **4 secrets** to your GitHub repository:

### 1. ANDROID_SIGNING_KEY

**Description**: Base64-encoded keystore file

**Value**: 
```
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
```

### 2. ANDROID_KEY_ALIAS

**Description**: The alias name for the signing key

**Value**: 
```
sc-release
```

### 3. ANDROID_KEYSTORE_PASSWORD

**Description**: Password for the keystore file

**Value**: 
```
SC_Temp_Password_2024
```

### 4. ANDROID_KEY_PASSWORD

**Description**: Password for the signing key

**Value**: 
```
SC_Temp_Password_2024
```

---

## 🔐 How to Add Secrets to GitHub Environments

### Step 1: Create Environments

1. Navigate to your repository: https://github.com/Treystu/SC
2. Go to **Settings** → **Environments**
3. Click **New environment**
4. Create two environments:
   - Name: `staging`
   - Name: `production`

### Step 2: Add Secrets to BOTH Environments

**For STAGING environment:**

1. Click on the `staging` environment
2. Scroll to **Environment secrets**
3. Click **Add secret** for each of the 4 secrets below:

**For PRODUCTION environment:**

1. Click on the `production` environment
2. Repeat the same process
3. Add all 4 secrets (you can use the same values for now, or generate separate keystores)

### The 4 Secrets to Add:

#### 1. ANDROID_SIGNING_KEY

## ⚠️ IMPORTANT SECURITY NOTES

### For Production Use:

1. **Change the passwords!** The current passwords are temporary and should be changed for production:
   ```bash
   # Generate a strong password
   openssl rand -base64 32
   ```

2. **Create a new keystore with your own secure password:**
   ```bash
   keytool -genkey -v -keystore sovereign-communications.keystore \
     -alias sc-release -keyalg RSA -keysize 2048 -validity 10000 \
     -storepass "YOUR_SECURE_PASSWORD_HERE" \
     -keypass "YOUR_SECURE_PASSWORD_HERE" \
     -dname "CN=Sovereign Communications, OU=Development, O=Sovereign Communications, L=Your City, ST=Your State, C=US"
   ```

3. **Backup your keystore securely!**
   - Store the `sovereign-communications.keystore` file in a secure location
   - Keep multiple backups (encrypted)
   - **NEVER commit the keystore to git**
   - Losing this file means you can't update your app on Google Play

4. **Never share these secrets**:
   - Keep passwords private
   - Don't commit to version control
   - Store securely (password manager, encrypted storage)

---

## 🚀 How to Trigger Builds

### Option 1: Tag-based (Automatic)

**For Staging:**
```bash
git tag staging-v1.0.0-beta.1
git push origin staging-v1.0.0-beta.1
```
- Uses `staging` environment
- Creates a pre-release on GitHub

**For Production:**
```bash
git tag v1.0.0
git push origin v1.0.0
```
- Uses `production` environment
- Creates a full release on GitHub

### Option 2: Manual Workflow Dispatch

1. Go to **Actions** tab
2. Select "Build and Release Android APK"
3. Click **Run workflow**
4. Select branch (e.g., `main` or `copilot/complete-mesh-networking-v1`)
5. **Choose environment**: `staging` or `production`
6. Click **Run workflow**
7. Download APK from workflow artifacts

---

## 📦 Download URLs

### Staging (Pre-releases)
```
https://github.com/Treystu/SC/releases/download/staging-v1.0.0-beta.1/app-release.apk
```

### Production (Latest Release)
```
https://github.com/Treystu/SC/releases/latest/download/app-release.apk
```

The production URL is already configured in your webapp.

---

## 🔍 Verifying the APK Signature

After building, verify the signature:

```bash
# Download the APK from releases
curl -L https://github.com/Treystu/SC/releases/latest/download/app-release.apk -o app-release.apk

# Verify signature
jarsigner -verify -verbose -certs app-release.apk
```

Expected output should include:
```
jar verified.
```

---

## 🆘 Troubleshooting

### Build fails with "keystore not found"
- Ensure `ANDROID_SIGNING_KEY` is properly base64-encoded
- Check that there are no extra newlines in the secret value

### Signature verification fails
- Verify alias matches: `sc-release`
- Check passwords are correct
- Ensure keystore file isn't corrupted

### Can't update app on Google Play
- You must use the **same keystore** for all updates
- Backup your keystore file securely
- Never lose the original keystore

---

## 📱 Next Steps

1. ✅ Add all 4 secrets to GitHub
2. ✅ Trigger a test build (manual workflow or tag)
3. ✅ Download and test the APK
4. ✅ Verify signature
5. ✅ Upload to Google Play Console for production

---

**Generated**: 2025-12-04  
**Keystore File**: `sovereign-communications.keystore` (2,848 bytes)  
**Base64 Size**: 3,800 characters  
**Validity**: 10,000 days (~27 years)
