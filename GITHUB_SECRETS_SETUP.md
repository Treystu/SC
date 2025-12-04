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
[Your base64-encoded keystore - DO NOT commit actual value to git]
[Generate using: base64 your-keystore.keystore > keystore.base64.txt]
[Then copy the contents here as a GitHub Environment secret]
```

**How to generate**:
1. Create keystore: `keytool -genkey -v -keystore sc.keystore -alias sc-release -keyalg RSA -keysize 2048 -validity 10000`
2. Encode to base64: `base64 sc.keystore > keystore.base64.txt`
3. Copy contents of keystore.base64.txt to this secret
4. **IMPORTANT**: Never commit keystore.base64.txt or sc.keystore to git!

### 2. ANDROID_KEY_ALIAS

**Description**: The alias name for the signing key

**Value**: 
```
sc-release
```

(Or use the alias you specified when creating the keystore)

### 3. ANDROID_KEYSTORE_PASSWORD

**Description**: Password for the keystore file

**Value**: 
```
[Your secure keystore password - DO NOT commit actual value]
[Use a strong, unique password for production]
```

**Recommendation**: Use a strong password generator for production builds. The example `SC_Temp_Password_2024` is for demonstration only.

### 4. ANDROID_KEY_PASSWORD

**Description**: Password for the signing key

**Value**: 
```
[Your secure key password - DO NOT commit actual value]
[Can be same as keystore password or different]
```

**Recommendation**: Use a strong password generator for production builds. The example `SC_Temp_Password_2024` is for demonstration only.

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
