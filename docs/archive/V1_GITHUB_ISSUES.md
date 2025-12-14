# V1 Rollout - GitHub Issues

This document contains all granular tasks needed for V1 rollout, ready to be created as GitHub issues.

---

## Phase 1, Step 1: Data Persistence Integration

### Issue 1: [P0] Integrate data persistence - Web (IndexedDB)

**Labels:** `P0`, `blocker`, `web`, `persistence`, `Phase 1`

**Description:**
IndexedDB schema is defined but not integrated with the mesh network. Users lose all data on page refresh.

**Tasks:**
- [ ] Wire up message storage in useMeshNetwork hook
- [ ] Wire up contact storage
- [ ] Wire up conversation storage
- [ ] Persist identity, peers, routes, session keys
- [ ] Test persistence across page reloads
- [ ] Update conversation list to load from DB
- [ ] Update contact list to load from DB

**Files to Modify:**
- `web/src/hooks/useMeshNetwork.ts`
- `web/src/storage/database.ts`

**Acceptance Criteria:**
- Messages persist after page reload
- Contacts persist after page reload
- Conversation history loads from database
- No data loss on refresh

**Testing:**
1. Send messages
2. Refresh page
3. Verify messages still present
4. Add contact
5. Refresh page
6. Verify contact still present

---

### Issue 2: [P0] Integrate data persistence - Android (Room)

**Labels:** `P0`, `blocker`, `android`, `persistence`, `Phase 1`

**Description:**
Room database schema is defined but not connected to MeshNetworkService. Users lose all data on app restart.

**Tasks:**
- [ ] Connect database to MeshNetworkService
- [ ] Implement DAOs (Message, Contact, Conversation, Identity, Peer)
- [ ] Create repositories for each entity
- [ ] Wire up message persistence on send/receive
- [ ] Wire up contact persistence
- [ ] Load persisted data on service start
- [ ] Test persistence across app restarts

**Files to Modify:**
- `android/.../service/MeshNetworkService.kt`
- `android/.../data/repository/MessageRepository.kt`
- `android/.../data/repository/ContactRepository.kt`
- `android/.../data/repository/ConversationRepository.kt`

**Acceptance Criteria:**
- Messages persist after app restart
- Contacts persist after app restart
- Conversation list loads from database
- Service loads persisted state on startup

**Testing:**
1. Send messages
2. Close app completely
3. Reopen app
4. Verify messages still present
5. Add contact
6. Restart app
7. Verify contact still present

---

### Issue 3: [P0] Integrate data persistence - iOS (Core Data)

**Labels:** `P0`, `blocker`, `ios`, `persistence`, `Phase 1`

**Description:**
Core Data entities are defined but not integrated with the view models. Users lose all data on app restart.

**Tasks:**
- [ ] Verify CoreData entities (Message, Contact, Conversation, Identity, Peer)
- [ ] Connect CoreData stack to view models
- [ ] Implement fetch requests for messages, contacts, conversations
- [ ] Wire up message persistence on send/receive
- [ ] Wire up contact persistence
- [ ] Load persisted data on app launch
- [ ] Test persistence across app restarts

**Files to Modify:**
- `ios/.../ViewModels/*.swift`
- `ios/.../Data/CoreDataStack.swift`

**Acceptance Criteria:**
- Messages persist after app restart
- Contacts persist after app restart
- Conversation list loads from Core Data
- All data available after app relaunch

**Testing:**
1. Send messages
2. Close app completely
3. Reopen app
4. Verify messages still present
5. Add contact
6. Restart app
7. Verify contact still present

---

### Issue 4: [P0] Implement secure key storage

**Labels:** `P0`, `security`, `persistence`, `Phase 1`

**Description:**
Private keys need secure storage on all platforms (not just in regular database).

**Tasks:**
- [ ] Web: Document IndexedDB limitations, add backup warnings
- [ ] Android: Implement KeystoreManager for private key storage
- [ ] iOS: Verify Keychain integration for private keys
- [ ] Ensure private keys never stored in plain database
- [ ] Add key backup/restore functionality

**Files to Create/Modify:**
- `android/.../data/security/KeystoreManager.kt`
- `web/src/storage/keyStorage.ts`
- `ios/.../Data/KeychainManager.swift`

**Acceptance Criteria:**
- Private keys stored securely (Keystore/Keychain)
- Private keys not in regular database
- Keys persist across app restarts
- Backup/restore warnings implemented

---

## Phase 1, Step 2: Core UX Implementation

### Issue 5: [P0] Implement user onboarding flow - Web

**Labels:** `P0`, `ux`, `web`, `onboarding`, `Phase 1`

**Description:**
No onboarding flow exists. New users don't know how to use the app.

**Tasks:**
- [ ] Create welcome screen component
- [ ] Create identity explanation screen
- [ ] Create "add contact" tutorial screen
- [ ] Create privacy explanation screen
- [ ] Implement onboarding flow navigation
- [ ] Add "first launch" detection
- [ ] Add "skip" option with confirmation
- [ ] Store onboarding completion flag

**Files to Create:**
- `web/src/components/Onboarding/WelcomeScreen.tsx`
- `web/src/components/Onboarding/IdentityScreen.tsx`
- `web/src/components/Onboarding/AddContactScreen.tsx`
- `web/src/components/Onboarding/PrivacyScreen.tsx`
- `web/src/components/Onboarding/OnboardingFlow.tsx`

**Acceptance Criteria:**
- Onboarding shows on first launch only
- 4 screens with clear explanations
- Can skip but with confirmation
- Completion flag persists
- Consistent branding and messaging

**Testing:**
1. Clear all data
2. Reload app
3. Verify onboarding appears
4. Complete onboarding
5. Reload app
6. Verify onboarding doesn't appear

---

### Issue 6: [P0] Implement user onboarding flow - Android

**Labels:** `P0`, `ux`, `android`, `onboarding`, `Phase 1`

**Description:**
No onboarding flow exists. New users don't know how to use the app.

**Tasks:**
- [ ] Create OnboardingScreen with 4 pages
- [ ] Implement ViewPager for screen navigation
- [ ] Design welcome screen (Material 3)
- [ ] Design identity explanation screen
- [ ] Design "add contact" tutorial screen
- [ ] Design privacy explanation screen
- [ ] Add "first launch" detection
- [ ] Store completion in SharedPreferences

**Files to Create:**
- `android/.../ui/screen/OnboardingScreen.kt`
- `android/.../ui/components/OnboardingPage.kt`

**Acceptance Criteria:**
- Onboarding shows on first launch only
- 4 screens with Material 3 design
- Swipe navigation between screens
- Skip option available
- Completion persists

**Testing:**
1. Fresh install
2. Open app
3. Verify onboarding appears
4. Complete onboarding
5. Restart app
6. Verify onboarding doesn't appear

---

### Issue 7: [P0] Implement user onboarding flow - iOS

**Labels:** `P0`, `ux`, `ios`, `onboarding`, `Phase 1`

**Description:**
No onboarding flow exists. New users don't know how to use the app.

**Tasks:**
- [ ] Create OnboardingView with TabView
- [ ] Design welcome screen (iOS style)
- [ ] Design identity explanation screen
- [ ] Design "add contact" tutorial screen
- [ ] Design privacy explanation screen
- [ ] Add "first launch" detection
- [ ] Store completion in UserDefaults

**Files to Create:**
- `ios/.../Views/OnboardingView.swift`

**Acceptance Criteria:**
- Onboarding shows on first launch only
- 4 screens with iOS design language
- Page control navigation
- Skip option available
- Completion persists

**Testing:**
1. Delete and reinstall app
2. Open app
3. Verify onboarding appears
4. Complete onboarding
5. Restart app
6. Verify onboarding doesn't appear

---

### Issue 8: [P0] Connect Android ChatScreen to MeshNetworkService

**Labels:** `P0`, `blocker`, `android`, `messaging`, `Phase 1`

**Description:**
ChatScreen UI exists but is not connected to MeshNetworkService. Cannot send or receive messages.

**Tasks:**
- [ ] Connect ChatScreen to MeshNetworkService
- [ ] Implement message sending via service
- [ ] Implement message receiving listener
- [ ] Update UI when messages received
- [ ] Handle keyboard properly
- [ ] Persist messages to database
- [ ] Test end-to-end message flow

**Files to Modify:**
- `android/.../ui/screen/ChatScreen.kt`
- `android/.../service/MeshNetworkService.kt`
- `android/.../ui/screen/ConversationViewModel.kt`

**Acceptance Criteria:**
- Can send messages from ChatScreen
- Received messages appear in ChatScreen
- Messages persist to database
- Keyboard handling works correctly
- Message bubbles display properly

**Testing:**
1. Open chat screen
2. Send message
3. Verify message appears
4. Receive message from peer
5. Verify received message displays
6. Restart app
7. Verify messages persisted

---

### Issue 9: [P0] Standardize terminology across all platforms

**Labels:** `P0`, `ux`, `consistency`, `Phase 1`

**Description:**
Inconsistent terminology across platforms causes confusion. Need standard terms.

**Tasks:**
- [ ] Create terminology glossary document
- [ ] Audit all UI strings on Web
- [ ] Audit all UI strings on Android
- [ ] Audit all UI strings on iOS
- [ ] Replace "Peer" with "Contact" in UI
- [ ] Replace "Chat" with "Conversation" in UI
- [ ] Standardize connection status text
- [ ] Update button labels
- [ ] Update menu items
- [ ] Update error messages

**Standard Terms:**
- Contact (not Peer)
- Conversation (not Chat)
- Connected/Disconnected (not Online/Offline)
- Peer ID (when showing to users)
- Fingerprint (for verification)
- Send/Receive (not Transmit/Deliver)

**Files to Create:**
- `docs/TERMINOLOGY_GLOSSARY.md`

**Files to Modify:**
- All UI strings in all platforms

**Acceptance Criteria:**
- Glossary document created
- All platforms use "Contact" not "Peer" in UI
- All platforms use "Conversation" not "Chat"
- Consistent connection status text
- No mixed terminology

**Testing:**
1. Review all UI screens on each platform
2. Verify consistent terminology
3. Check button labels
4. Check menu items
5. Check error messages

---

## Phase 2, Step 3: Feature Completion

### Issue 10: [P1] Implement notification system - Web

**Labels:** `P1`, `notifications`, `web`, `Phase 2`

**Description:**
Users miss messages because no notification system exists.

**Tasks:**
- [ ] Request notification permission
- [ ] Implement browser notifications for messages
- [ ] Add notification sound
- [ ] Implement notification settings
- [ ] Add unread badge count
- [ ] Handle notification click (open conversation)

**Files to Create:**
- `web/src/notifications/NotificationManager.ts`
- `web/src/components/NotificationSettings.tsx`

**Acceptance Criteria:**
- Browser notifications work when tab inactive
- Sound plays for new messages
- Clicking notification opens conversation
- Settings to enable/disable
- Unread badge count displays

---

### Issue 11: [P1] Implement notification system - Android

**Labels:** `P1`, `notifications`, `android`, `Phase 2`

**Description:**
Users miss messages because local notifications not implemented.

**Tasks:**
- [ ] Implement NotificationManager
- [ ] Create notification channel
- [ ] Show notifications for new messages
- [ ] Add notification actions (Reply, Mark Read)
- [ ] Implement notification sound
- [ ] Add notification settings
- [ ] Implement unread badge count

**Files to Modify:**
- `android/.../notifications/NotificationManager.kt`

**Acceptance Criteria:**
- Local notifications for new messages
- Notification actions work
- Sound and vibration configurable
- Badge count on app icon
- Settings to control notifications

---

### Issue 12: [P1] Implement notification system - iOS

**Labels:** `P1`, `notifications`, `ios`, `Phase 2`

**Description:**
Users miss messages because local notifications not implemented.

**Tasks:**
- [ ] Implement NotificationManager
- [ ] Request notification permission
- [ ] Show local notifications for messages
- [ ] Add notification content preview
- [ ] Implement notification sound
- [ ] Add notification settings
- [ ] Implement unread badge count

**Files to Modify:**
- `ios/.../Notifications/NotificationManager.swift`

**Acceptance Criteria:**
- Local notifications for new messages
- Content preview shows sender and message
- Sound configurable
- Badge count on app icon
- Settings to control notifications

---

### Issue 13: [P1] Add QR code scanner to Web

**Labels:** `P1`, `feature`, `web`, `Phase 2`

**Description:**
Web app cannot scan QR codes while mobile apps can. Need camera access and QR scanning.

**Tasks:**
- [ ] Add jsQR or html5-qrcode library
- [ ] Request camera permission
- [ ] Create QRCodeScanner component
- [ ] Integrate with AddContactDialog
- [ ] Add fallback for file upload
- [ ] Handle errors gracefully
- [ ] Document HTTPS requirement

**Files to Create:**
- `web/src/components/QRCodeScanner.tsx`

**Files to Modify:**
- `web/src/components/AddContactDialog.tsx`

**Acceptance Criteria:**
- Camera access works
- QR codes successfully scanned
- Contact auto-added from QR
- File upload fallback works
- Clear error messages
- Only works on HTTPS

---

### Issue 14: [P1] Wire up settings functionality - Web

**Labels:** `P1`, `settings`, `web`, `Phase 2`

**Description:**
Settings screen exists but most options don't work.

**Tasks:**
- [ ] Implement theme selection (dark/light)
- [ ] Implement notification preferences
- [ ] Implement privacy settings (read receipts, typing)
- [ ] Implement network settings
- [ ] Add storage statistics display
- [ ] Wire up data export/import
- [ ] Add version info display
- [ ] Persist all settings

**Files to Modify:**
- `web/src/components/SettingsPanel.tsx`
- `web/src/hooks/useSettings.ts`

**Acceptance Criteria:**
- Theme selection works
- Notification settings functional
- Privacy settings work
- Storage stats display
- Export/import functional
- Version info shows
- Settings persist

---

### Issue 15: [P1] Wire up settings functionality - Android

**Labels:** `P1`, `settings`, `android`, `Phase 2`

**Description:**
Settings screen exists but most options don't work.

**Tasks:**
- [ ] Implement theme selection (light/dark/auto)
- [ ] Implement notification preferences
- [ ] Implement privacy settings
- [ ] Implement network settings (WebRTC, BLE)
- [ ] Add storage statistics
- [ ] Wire up data export/import
- [ ] Add version and license info
- [ ] Use SharedPreferences/DataStore

**Files to Modify:**
- `android/.../ui/screen/SettingsScreen.kt`

**Acceptance Criteria:**
- All settings functional
- Theme changes work
- Notification settings work
- Storage stats show
- Export/import works
- Version displays

---

### Issue 16: [P1] Wire up settings functionality - iOS

**Labels:** `P1`, `settings`, `ios`, `Phase 2`

**Description:**
Settings screen exists but most options don't work.

**Tasks:**
- [ ] Implement theme selection
- [ ] Implement notification preferences
- [ ] Implement privacy settings
- [ ] Implement network settings
- [ ] Add storage statistics
- [ ] Wire up data export/import
- [ ] Add version and license info
- [ ] Use UserDefaults

**Files to Modify:**
- `ios/.../Views/SettingsView.swift`
- `ios/.../Views/CompleteSettingsView.swift`

**Acceptance Criteria:**
- All settings functional
- Theme changes work
- Notification settings work
- Storage stats show
- Export/import works
- Version displays

---

### Issue 17: [P1] Complete media features - Image upload

**Labels:** `P1`, `media`, `feature`, `Phase 2`

**Description:**
Image upload partially implemented but not fully functional on all platforms.

**Tasks:**
- [ ] Complete image upload flow (Web)
- [ ] Complete image upload flow (Android)
- [ ] Complete image upload flow (iOS)
- [ ] Implement image compression
- [ ] Add image preview/lightbox
- [ ] Add progress indicators
- [ ] Enforce file size limits
- [ ] Handle errors gracefully

**Acceptance Criteria:**
- Image upload works on all platforms
- Images compressed before sending
- Preview works
- Progress shown
- Size limits enforced
- Error handling works

---

### Issue 18: [P1] Complete media features - Voice recording

**Labels:** `P1`, `media`, `feature`, `Phase 2`

**Description:**
Voice recording components exist but not integrated.

**Tasks:**
- [ ] Complete voice recording (Web)
- [ ] Complete voice recording (Android)
- [ ] Complete voice recording (iOS)
- [ ] Implement voice playback
- [ ] Add waveform visualization
- [ ] Add recording timer
- [ ] Enforce duration limits
- [ ] Handle errors gracefully

**Acceptance Criteria:**
- Voice recording works on all platforms
- Playback works
- Waveform displays
- Timer shows
- Duration limits enforced
- Error handling works

---

## Phase 2, Step 4: Testing & Documentation

### Issue 19: [P1] Create privacy and security explanations

**Labels:** `P1`, `documentation`, `ux`, `Phase 2`

**Description:**
Users don't understand how encryption works or what makes the app secure.

**Tasks:**
- [ ] Create Privacy screen in settings
- [ ] Explain E2E encryption in plain language
- [ ] Explain serverless architecture
- [ ] Explain data sovereignty
- [ ] Show security features (Ed25519, ChaCha20)
- [ ] Add fingerprint verification guide
- [ ] Link to full documentation

**Content to Add:**
- What is end-to-end encryption?
- How are messages secured?
- What is peer-to-peer?
- How do I verify contacts?
- Can anyone read my messages?
- Is my data on servers?
- How do I backup data?

**Files to Create:**
- `web/src/components/PrivacyInfo.tsx`
- `android/.../ui/screen/PrivacyInfoScreen.kt`
- `ios/.../Views/PrivacyInfoView.swift`

**Acceptance Criteria:**
- Privacy screen accessible from settings
- Plain language explanations
- Visual aids where helpful
- Links to documentation
- Fingerprint verification guide

---

### Issue 20: [P1] Add in-app help system

**Labels:** `P1`, `documentation`, `ux`, `Phase 2`

**Description:**
No help system exists. Users can't get assistance within the app.

**Tasks:**
- [ ] Create Help screen
- [ ] Add FAQ section
- [ ] Add troubleshooting guide
- [ ] Add "How to" guides
- [ ] Link to external docs
- [ ] Add contact support option

**Topics to Cover:**
- Getting Started
- Adding Contacts
- Sending Messages
- Verifying Security
- Troubleshooting Connections
- Data Privacy
- Backup & Restore

**Files to Create:**
- `web/src/components/Help.tsx`
- `android/.../ui/screen/HelpScreen.kt`
- `ios/.../Views/HelpView.swift`

**Acceptance Criteria:**
- Help screen accessible from settings
- FAQ with common questions
- Troubleshooting guide
- How-to guides
- Links to external docs
- Support contact option

---

### Issue 21: [P1] Write platform user guides

**Labels:** `P1`, `documentation`, `Phase 2`

**Description:**
Need user-facing documentation for each platform.

**Tasks:**
- [ ] Write Web User Guide
- [ ] Write Android User Guide
- [ ] Write iOS User Guide
- [ ] Write Getting Started Guide
- [ ] Write Security Guide
- [ ] Write Troubleshooting Guide
- [ ] Write FAQ
- [ ] Add screenshots

**Files to Create:**
- `docs/guides/WEB_USER_GUIDE.md`
- `docs/guides/ANDROID_USER_GUIDE.md`
- `docs/guides/IOS_USER_GUIDE.md`
- `docs/guides/GETTING_STARTED.md`
- `docs/guides/SECURITY_GUIDE.md`
- `docs/guides/TROUBLESHOOTING.md`
- `docs/guides/FAQ.md`

**Acceptance Criteria:**
- Complete user guide for each platform
- Cross-platform getting started guide
- Security explained clearly
- Troubleshooting common issues
- FAQ answers common questions
- Screenshots included

---

### Issue 22: [P1] Perform cross-platform integration testing

**Labels:** `P1`, `testing`, `Phase 2`

**Description:**
Need automated tests for cross-platform messaging.

**Tasks:**
- [ ] Set up test infrastructure
- [ ] Test Web ↔ Android messaging
- [ ] Test Web ↔ iOS messaging
- [ ] Test Android ↔ iOS messaging
- [ ] Test multi-platform mesh (all 3)
- [ ] Test file transfer between platforms
- [ ] Test QR pairing (mobile)
- [ ] Test manual pairing (all platforms)
- [ ] Test persistence across all platforms

**Files to Create:**
- `tests/integration/cross-platform.test.ts`

**Acceptance Criteria:**
- All cross-platform message flows tested
- File transfer works between platforms
- QR pairing tested
- Manual pairing tested
- Persistence verified
- Tests automated in CI

---

### Issue 23: [P1] Perform accessibility audit

**Labels:** `P1`, `testing`, `accessibility`, `Phase 2`

**Description:**
No accessibility testing performed. Need to ensure app is accessible.

**Tasks:**
- [ ] Test with screen readers (all platforms)
- [ ] Test keyboard navigation (web)
- [ ] Check color contrast
- [ ] Test font scaling (mobile)
- [ ] Add ARIA labels (web)
- [ ] Add content descriptions (Android)
- [ ] Test VoiceOver (iOS)
- [ ] Fix accessibility issues found

**Tools:**
- NVDA/JAWS (web)
- TalkBack (Android)
- VoiceOver (iOS)
- Accessibility Inspector

**Acceptance Criteria:**
- Screen reader testing complete
- Keyboard navigation works (web)
- Color contrast sufficient
- Font scaling works (mobile)
- ARIA labels added (web)
- Content descriptions added (Android)
- All critical issues fixed

---

### Issue 24: [P1] Update README with audit findings

**Labels:** `P1`, `documentation`, `Phase 2`

**Description:**
README should reference platform parity audit and link to implementation status.

**Tasks:**
- [ ] Add link to PLATFORM_PARITY_AUDIT.md
- [ ] Add link to PLATFORM_PARITY_SUMMARY.md
- [ ] Update feature status based on audit
- [ ] Add V1 beta roadmap
- [ ] Add platform comparison table
- [ ] Update completion percentages

**Files to Modify:**
- `README.md`

**Acceptance Criteria:**
- Links to audit documents
- Feature status updated
- V1 roadmap visible
- Platform comparison clear
- Completion percentages accurate

---

## Post V1 (P2 - Future Enhancements)

### Issue 25: [P2] Implement read receipts

**Labels:** `P2`, `feature`, `messaging`

**Description:**
Users can't tell if messages were read.

**Tasks:**
- [ ] Send read confirmations (optional)
- [ ] Display checkmarks (✓ sent, ✓✓ delivered, ✓✓ read)
- [ ] Add privacy setting to disable
- [ ] Respect recipient's privacy settings

**Acceptance Criteria:**
- Read receipts work when enabled
- Privacy setting available
- Visual indicators clear

---

### Issue 26: [P2] Implement typing indicators

**Labels:** `P2`, `feature`, `messaging`

**Description:**
No typing indicators exist.

**Tasks:**
- [ ] Send typing state
- [ ] Receive typing state
- [ ] Display "Contact is typing..."
- [ ] Add privacy setting to disable
- [ ] Timeout after 5 seconds of inactivity

**Acceptance Criteria:**
- Typing indicators work
- Privacy setting available
- Timeout works properly

---

### Issue 27: [P2] Add emoji picker (Mobile)

**Labels:** `P2`, `feature`, `mobile`

**Description:**
Mobile platforms lack emoji picker.

**Tasks:**
- [ ] Add emoji picker button in message input
- [ ] Implement native emoji selector
- [ ] Add recent emojis
- [ ] Add categories
- [ ] Insert into message

**Acceptance Criteria:**
- Emoji picker accessible
- Recent emojis tracked
- Categories available
- Insertion works

---

### Issue 28: [P2] Implement message search (Mobile)

**Labels:** `P2`, `feature`, `mobile`

**Description:**
Can't search message history on mobile.

**Tasks:**
- [ ] Add search bar in conversation
- [ ] Implement full-text search
- [ ] Highlight results
- [ ] Navigate to matched messages
- [ ] Search all conversations

**Acceptance Criteria:**
- Search works
- Results highlighted
- Navigation works
- All conversations searchable

---

### Issue 29: [P2] Add message reactions

**Labels:** `P2`, `feature`, `messaging`

**Description:**
No message reactions exist.

**Tasks:**
- [ ] Long-press message to react
- [ ] Quick reactions (👍 ❤️ 😂 etc.)
- [ ] Show reaction counts
- [ ] Remove reaction
- [ ] Sync across platforms

**Acceptance Criteria:**
- Reactions work
- Count displays
- Removal works
- Cross-platform sync

---

### Issue 30: [P2] Implement group messaging

**Labels:** `P2`, `feature`, `messaging`

**Description:**
Only 1-on-1 messaging works.

**Tasks:**
- [ ] Create group
- [ ] Add/remove members
- [ ] Group name and avatar
- [ ] Group messages
- [ ] Member list
- [ ] Leave group
- [ ] Group admin features

**Acceptance Criteria:**
- Groups can be created
- Members managed
- Group messaging works
- Admin features work

---

### Issue 31: [P2] Performance testing and optimization

**Labels:** `P2`, `testing`, `performance`

**Description:**
No performance benchmarks exist.

**Tasks:**
- [ ] Measure message send latency
- [ ] Measure connection setup time
- [ ] Measure memory usage
- [ ] Test messages per second
- [ ] Test concurrent peers
- [ ] Test mobile battery drain
- [ ] Optimize bottlenecks found

**Target Metrics:**
- Message latency: <100ms
- Connection setup: <2s
- Memory usage: <100MB
- Messages/second: 1000+
- Concurrent peers: 50+
- Battery drain: <5%/hour

**Acceptance Criteria:**
- All metrics measured
- Targets documented
- Bottlenecks identified
- Critical issues optimized

---

## Summary

**Total Issues:** 31

**Phase 1 (P0 - Critical):** 9 issues
- Step 1: Data Persistence (4 issues)
- Step 2: Core UX (5 issues)

**Phase 2 (P1 - High Priority):** 15 issues
- Step 3: Feature Completion (8 issues)
- Step 4: Testing & Documentation (7 issues)

**Post V1 (P2 - Enhancements):** 7 issues

All issues are granular, actionable, and ready to be created in GitHub with the specified labels and content.

---

**Created:** November 17, 2024  
**Purpose:** V1 rollout task tracking  
**Status:** Ready to create in GitHub
