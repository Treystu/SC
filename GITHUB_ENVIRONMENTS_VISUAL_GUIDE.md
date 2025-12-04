# GitHub Environments Setup - Visual Guide

## 🎯 Secret Placement: Environments (NOT Repository Secrets)

```
GitHub Repository Settings
│
├─ Secrets and variables (Actions)
│  └─ ❌ DO NOT add secrets here (these are repository-wide)
│
└─ Environments ✅ ADD SECRETS HERE
   │
   ├─ 🔶 staging
   │  ├─ Environment secrets:
   │  │  ├─ ANDROID_SIGNING_KEY (base64 keystore)
   │  │  ├─ ANDROID_KEY_ALIAS (sc-release)
   │  │  ├─ ANDROID_KEYSTORE_PASSWORD (SC_Temp_Password_2024)
   │  │  └─ ANDROID_KEY_PASSWORD (SC_Temp_Password_2024)
   │  │
   │  └─ Used for:
   │     ├─ Tags: staging-v*
   │     ├─ Manual workflow: environment = "staging"
   │     └─ Creates pre-releases
   │
   └─ ✅ production
      ├─ Environment secrets:
      │  ├─ ANDROID_SIGNING_KEY (same or different keystore)
      │  ├─ ANDROID_KEY_ALIAS (sc-release)
      │  ├─ ANDROID_KEYSTORE_PASSWORD (SC_Temp_Password_2024)
      │  └─ ANDROID_KEY_PASSWORD (SC_Temp_Password_2024)
      │
      └─ Used for:
         ├─ Tags: v*
         ├─ Manual workflow: environment = "production"
         └─ Creates full releases
```

## 🔄 Workflow Trigger Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Actions                        │
└─────────────────────────────────────────────────────────────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
        ┌──────────────┐         ┌──────────────┐
        │ Push Tag     │         │   Manual     │
        │              │         │  Workflow    │
        ├──────────────┤         ├──────────────┤
        │ staging-v*   │         │ Select:      │
        │ v*           │         │ - staging    │
        └──────────────┘         │ - production │
                 │               └──────────────┘
                 │                       │
                 └───────────┬───────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │  Workflow Determines  │
                 │    Environment:       │
                 ├───────────────────────┤
                 │ staging-v* → staging  │
                 │ v*        → production│
                 │ manual    → user pick │
                 └───────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
        ┌────────────────┐      ┌────────────────┐
        │ Uses secrets   │      │ Uses secrets   │
        │ from           │      │ from           │
        │ "staging" env  │      │ "production"   │
        └────────────────┘      └────────────────┘
                 │                       │
                 └───────────┬───────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │ Build & Sign APK │
                   └──────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
        ┌────────────────┐      ┌────────────────┐
        │ Pre-release    │      │ Full Release   │
        │ (staging tags) │      │ (v* tags)      │
        └────────────────┘      └────────────────┘
```

## 📝 Step-by-Step Setup Guide

### 1️⃣ Navigate to Environments

```
https://github.com/Treystu/SC/settings/environments
```

### 2️⃣ Create Staging Environment

1. Click **"New environment"**
2. Name: `staging`
3. Click **"Configure environment"**
4. Scroll to **"Environment secrets"**
5. Add all 4 secrets (see GITHUB_SECRETS_SETUP.md)

### 3️⃣ Create Production Environment

1. Click **"New environment"** again
2. Name: `production`
3. Click **"Configure environment"**
4. Scroll to **"Environment secrets"**
5. Add all 4 secrets (same values or different)

### 4️⃣ Verify Setup

Both environments should show:
```
staging
  └─ 4 secrets

production
  └─ 4 secrets
```

## 🧪 Testing Each Environment

### Test Staging

```bash
# Create staging tag
git tag staging-v1.0.0-beta.1
git push origin staging-v1.0.0-beta.1

# Or manual workflow
# Go to Actions → Build and Release Android APK
# Run workflow → Select "staging"
```

**Expected Result:**
- ✅ Uses secrets from `staging` environment
- ✅ Creates pre-release on GitHub
- ✅ APK downloadable from releases

### Test Production

```bash
# Create production tag
git tag v1.0.0
git push origin v1.0.0

# Or manual workflow
# Go to Actions → Build and Release Android APK
# Run workflow → Select "production"
```

**Expected Result:**
- ✅ Uses secrets from `production` environment
- ✅ Creates full release (not pre-release)
- ✅ APK available at `/releases/latest/download/app-release.apk`

## ⚠️ Common Mistakes

### ❌ Wrong: Adding to Repository Secrets
```
Settings → Secrets and variables → Actions → Repository secrets
```
**Why wrong?** No environment separation, can't differentiate staging from production.

### ✅ Correct: Adding to Environment Secrets
```
Settings → Environments → staging → Environment secrets
Settings → Environments → production → Environment secrets
```
**Why correct?** Separate credentials per environment, better security, clear separation.

## 🔒 Production Best Practices

### For Staging Environment
- Can use test keystore
- Shorter password OK
- Can recreate if lost

### For Production Environment
- **MUST** use secure keystore
- Strong password (32+ characters)
- **CRITICAL**: Backup securely - losing this means you can't update your app!
- Store in encrypted vault
- Multiple secure backups

### Recommended: Separate Keystores

```bash
# Staging keystore
keytool -genkey -v -keystore staging.keystore \
  -alias sc-staging -keyalg RSA -keysize 2048 -validity 3650

# Production keystore (more secure)
keytool -genkey -v -keystore production.keystore \
  -alias sc-production -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$(openssl rand -base64 32)" \
  -keypass "$(openssl rand -base64 32)"
```

Then add different base64-encoded keystores to each environment.

## 🎯 Summary

**Where?** GitHub Environments (both `staging` AND `production`)  
**What?** 4 secrets in each environment  
**Why?** Separate signing keys for testing vs production  
**How?** Settings → Environments → Create → Add secrets  

