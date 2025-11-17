# Platform Parity Action Items

**Reference:** [PLATFORM_PARITY_AUDIT.md](./PLATFORM_PARITY_AUDIT.md)  
**Date:** November 17, 2024  
**Status:** Ready for Implementation

This document breaks down the platform parity audit into actionable GitHub issues for implementation.

---

## Critical Issues (P0) - Must Fix for V1 Beta

### Issue #1: Integrate Data Persistence Across All Platforms
**Priority:** P0 (Blocker)  
**Effort:** 2-3 days per platform  
**Platforms:** Web, Android, iOS

**Description:**
All platforms have database schemas defined but persistence is not integrated with the application logic. Users lose all data when the app restarts.

**Acceptance Criteria:**
- [ ] Web: IndexedDB stores and retrieves messages, contacts, conversations
- [ ] Android: Room database persists data across app restarts
- [ ] iOS: Core Data persists data across app restarts
- [ ] Identity, peers, routes, and session keys are persisted
- [ ] Data persists across app restarts (tested)
- [ ] Conversation history loads from database
- [ ] Contact list loads from database

**Files to Modify:**
- Web: `web/src/hooks/useMeshNetwork.ts`, `web/src/storage/database.ts`
- Android: `android/.../service/MeshNetworkService.kt`, `android/.../data/repository/*`
- iOS: `ios/.../ViewModels/*.swift`, `ios/.../Data/CoreDataStack.swift`

**Testing:**
1. Send messages
2. Restart app
3. Verify messages still present
4. Add contact
5. Restart app
6. Verify contact still present

---

### Issue #2: Implement User Onboarding Flow
**Priority:** P0 (Critical UX)  
**Effort:** 1-2 days per platform  
**Platforms:** Web, Android, iOS

**Description:**
No onboarding flow exists. New users are confused and don't know how to use the app. Need a 4-screen welcome flow explaining the app and guiding first-time setup.

**Acceptance Criteria:**
- [ ] Welcome screen with app description
- [ ] Identity creation explanation screen
- [ ] "Add first contact" tutorial screen
- [ ] Privacy/security explanation screen
- [ ] Only shown on first launch
- [ ] Can be skipped but prompts user
- [ ] Consistent across all platforms (content-wise)

**Screens:**
1. **Welcome:** App logo, tagline, "Get Started" button
2. **Identity:** Show generated peer ID, explain what it is
3. **Add Contact:** Show options (QR, manual, demo), explain why needed
4. **Privacy:** Explain E2E encryption, no servers, data sovereignty

**Files to Create:**
- Web: `web/src/components/Onboarding/*.tsx`
- Android: `android/.../ui/screen/OnboardingScreen.kt`
- iOS: `ios/.../Views/OnboardingView.swift`

**Testing:**
1. Fresh install
2. Verify onboarding appears
3. Complete onboarding
4. Restart app
5. Verify onboarding doesn't appear again

---

### Issue #3: Integrate Android Chat UI with Service
**Priority:** P0 (Blocker for Android)  
**Effort:** 1-2 days  
**Platform:** Android

**Description:**
ChatScreen UI exists but is not connected to MeshNetworkService. Cannot send or receive messages on Android.

**Acceptance Criteria:**
- [ ] ChatScreen receives messages from service
- [ ] ChatScreen sends messages via service
- [ ] Message bubbles display correctly
- [ ] Timestamps show properly
- [ ] Keyboard handling works
- [ ] Messages persist to database
- [ ] Can send and receive in real-time

**Files to Modify:**
- `android/.../ui/screen/ChatScreen.kt`
- `android/.../service/MeshNetworkService.kt`
- `android/.../ui/screen/ConversationViewModel.kt`

**Testing:**
1. Open chat screen
2. Send message
3. Verify message appears
4. Receive message from peer
5. Verify received message displays
6. Restart app
7. Verify messages persisted

---

### Issue #4: Standardize Terminology Across Platforms
**Priority:** P0 (UX Consistency)  
**Effort:** 2-3 hours  
**Platforms:** Web, Android, iOS

**Description:**
Inconsistent terminology across platforms causes confusion. Some screens say "Contact", others say "Peer". Some say "Conversation", others say "Chat".

**Acceptance Criteria:**
- [ ] All platforms use "Contact" (not "Peer") in UI
- [ ] All platforms use "Conversation" (not "Chat") in UI
- [ ] Connection status uses "Connected/Disconnected" consistently
- [ ] App name "Sovereign Communications" (not "SC")
- [ ] Tagline "Decentralized, encrypted messaging" everywhere
- [ ] Terminology glossary document created

**Standard Terms:**
| Use | Not |
|-----|-----|
| Contact | Peer, User |
| Conversation | Chat, Thread |
| Connected | Online, Active |
| Peer ID | Public Key, Identity |
| Fingerprint | Hash, ID |
| End-to-end encrypted | E2E, Encrypted |
| Send/Receive | Transmit, Deliver |

**Files to Audit:**
- All UI strings in all platforms
- Button labels
- Menu items
- Error messages
- Settings labels

---

## High Priority Issues (P1) - Should Fix for V1 Beta

### Issue #5: Implement Notification System
**Priority:** P1  
**Effort:** 1 day per platform  
**Platforms:** Web, Android, iOS

**Description:**
Users miss messages because there's no notification system. Need browser notifications (web) and local notifications (mobile).

**Acceptance Criteria:**
- [ ] Web: Browser notifications when tab inactive
- [ ] Android: Local notifications with actions
- [ ] iOS: Local notifications with content preview
- [ ] Sound alerts (configurable)
- [ ] Notification settings in all platforms
- [ ] Unread badge counts
- [ ] Do Not Disturb mode

**Features:**
- Notification on message received
- Notification includes sender name and preview
- Click notification opens conversation
- Reply from notification (mobile)
- Mark as read from notification (mobile)
- Sound and vibration options

---

### Issue #6: Add QR Code Scanner to Web
**Priority:** P1  
**Effort:** 4-6 hours  
**Platform:** Web

**Description:**
Web app cannot scan QR codes. Mobile apps can. Need to add camera access and QR scanning to web.

**Acceptance Criteria:**
- [ ] Camera permission requested
- [ ] QR code scanner component
- [ ] Scans peer QR codes
- [ ] Automatically adds contact from QR
- [ ] Fallback to file upload if no camera
- [ ] Works on HTTPS only (documented)

**Library:** jsQR or html5-qrcode

**Files to Create:**
- `web/src/components/QRCodeScanner.tsx`
- Update `web/src/components/AddContactDialog.tsx`

---

### Issue #7: Wire Up Settings Functionality
**Priority:** P1  
**Effort:** 1-2 days per platform  
**Platforms:** Web, Android, iOS

**Description:**
Settings screens exist but most options don't actually do anything. Need to connect settings to app behavior.

**Acceptance Criteria:**
- [ ] Theme selection works
- [ ] Notification preferences work
- [ ] Privacy settings (read receipts, typing) work
- [ ] Network settings (WebRTC, BLE) work
- [ ] Storage statistics display correctly
- [ ] Data export/import functions
- [ ] Version info displays
- [ ] Settings persist across restarts

**Settings to Implement:**
- Theme (light/dark/auto)
- Notifications (enable/disable, sound)
- Privacy (read receipts, typing indicators)
- Network (WebRTC enable, BLE enable)
- Storage (show stats, clear cache)
- Data sovereignty (export, import, delete)
- About (version, licenses, help)

---

### Issue #8: Add Privacy & Security Explanations
**Priority:** P1  
**Effort:** 1 day  
**Platforms:** Web, Android, iOS

**Description:**
Users don't understand how encryption works or what makes the app secure. Need in-app explanations.

**Acceptance Criteria:**
- [ ] Privacy screen in settings
- [ ] Explains E2E encryption in plain language
- [ ] Explains serverless architecture
- [ ] Explains data sovereignty
- [ ] Shows security features (Ed25519, ChaCha20)
- [ ] Fingerprint verification guide
- [ ] Links to full documentation

**Content:**
- What is end-to-end encryption?
- How are messages secured?
- What is a peer-to-peer network?
- How do I verify my contacts?
- Can anyone read my messages?
- Is my data stored on servers?
- How do I backup my data?

---

### Issue #9: Add In-App Help System
**Priority:** P1  
**Effort:** 1 day  
**Platforms:** Web, Android, iOS

**Description:**
No help system. Users can't get assistance within the app. Need FAQ and troubleshooting.

**Acceptance Criteria:**
- [ ] Help screen accessible from settings
- [ ] FAQ with common questions
- [ ] Troubleshooting guide
- [ ] How to add contacts
- [ ] How to verify security
- [ ] Connection troubleshooting
- [ ] Links to external docs
- [ ] Contact support option

**Topics:**
- Getting Started
- Adding Contacts
- Sending Messages
- Verifying Security
- Troubleshooting Connections
- Data Privacy
- Backup & Restore
- Report a Problem

---

### Issue #10: Complete Media Features
**Priority:** P1  
**Effort:** 2-3 days  
**Platforms:** Web, Android, iOS

**Description:**
Media features (image upload, voice recording, file sharing) are partially implemented but not fully functional.

**Acceptance Criteria:**
- [ ] Image upload works on all platforms
- [ ] Image preview/lightbox works
- [ ] Voice recording works
- [ ] Voice playback works
- [ ] File upload/download works
- [ ] Progress indicators work
- [ ] File size limits enforced
- [ ] Compression on mobile

**Features:**
- Image: Upload, preview, compress, send
- Voice: Record, playback, send, waveform
- File: Upload, download, progress, size limits
- All: Error handling, retry, cancel

---

## Medium Priority Issues (P2) - Post V1

### Issue #11: Implement Read Receipts
**Priority:** P2  
**Effort:** 1 day  
**Platforms:** Web, Android, iOS

**Description:**
Users can't tell if messages were read. Implement optional read receipts.

**Acceptance Criteria:**
- [ ] Send read confirmations (optional)
- [ ] Display checkmarks (✓ sent, ✓✓ delivered, ✓✓ read)
- [ ] Privacy setting to disable
- [ ] Respect recipient's privacy settings

---

### Issue #12: Implement Typing Indicators
**Priority:** P2  
**Effort:** 1 day  
**Platforms:** Web, Android, iOS

**Description:**
No typing indicators. Implement "X is typing..." feature.

**Acceptance Criteria:**
- [ ] Send typing state
- [ ] Receive typing state
- [ ] Display "Contact is typing..."
- [ ] Privacy setting to disable
- [ ] Timeout after 5 seconds of inactivity

---

### Issue #13: Add Emoji Picker
**Priority:** P2  
**Effort:** 1 day  
**Platforms:** Android, iOS (Web has partial)

**Description:**
Mobile platforms lack emoji picker. Need native emoji selector.

**Acceptance Criteria:**
- [ ] Emoji picker button in message input
- [ ] Native emoji selector
- [ ] Recent emojis
- [ ] Categories
- [ ] Insert into message

---

### Issue #14: Implement Message Search
**Priority:** P2  
**Effort:** 1-2 days  
**Platforms:** Android, iOS (Web has component)

**Description:**
Can't search message history on mobile. Implement full-text search.

**Acceptance Criteria:**
- [ ] Search bar in conversation
- [ ] Full-text search
- [ ] Highlight results
- [ ] Navigate to matched messages
- [ ] Search all conversations

---

### Issue #15: Add Message Reactions
**Priority:** P2  
**Effort:** 2 days  
**Platforms:** Web, Android, iOS

**Description:**
No message reactions. Add emoji reactions to messages.

**Acceptance Criteria:**
- [ ] Long-press message to react
- [ ] Quick reactions (👍 ❤️ 😂 etc.)
- [ ] Show reaction counts
- [ ] Remove reaction
- [ ] Sync across platforms

---

### Issue #16: Implement Group Messaging
**Priority:** P2  
**Effort:** 1 week  
**Platforms:** Web, Android, iOS

**Description:**
Only 1-on-1 messaging works. Implement group conversations.

**Acceptance Criteria:**
- [ ] Create group
- [ ] Add/remove members
- [ ] Group name and avatar
- [ ] Group messages
- [ ] Member list
- [ ] Leave group
- [ ] Group admin features

---

### Issue #17: Add Video Calling
**Priority:** P2  
**Effort:** 1 week  
**Platform:** Web (initially)

**Description:**
Web has video call components but not integrated. Complete implementation.

**Acceptance Criteria:**
- [ ] Initiate video call
- [ ] Accept/reject call
- [ ] Video/audio streams
- [ ] Mute audio
- [ ] Disable video
- [ ] Screen sharing
- [ ] Call controls

---

## Documentation Issues

### Issue #18: Create Platform User Guides
**Priority:** P1  
**Effort:** 1 day

**Description:**
Need user guides for each platform explaining how to use the app.

**Deliverables:**
- [ ] Web User Guide
- [ ] Android User Guide
- [ ] iOS User Guide
- [ ] Getting Started Guide
- [ ] Security Guide
- [ ] Troubleshooting Guide
- [ ] FAQ

---

### Issue #19: Create Developer Guides
**Priority:** P2  
**Effort:** 2 days

**Description:**
Need developer documentation for contributing and understanding architecture.

**Deliverables:**
- [ ] Architecture Overview
- [ ] Terminology Glossary
- [ ] UI/UX Style Guide
- [ ] Brand Guidelines
- [ ] Testing Guide
- [ ] Contributing Guide
- [ ] Platform Deviations Doc

---

### Issue #20: Update README with Audit Findings
**Priority:** P1  
**Effort:** 1 hour

**Description:**
README should reference the platform parity audit and link to implementation status.

**Changes:**
- [ ] Add link to PLATFORM_PARITY_AUDIT.md
- [ ] Add link to PLATFORM_PARITY_SUMMARY.md
- [ ] Update feature status based on audit
- [ ] Add V1 beta roadmap
- [ ] Add platform comparison table

---

## Testing Issues

### Issue #21: Cross-Platform Integration Tests
**Priority:** P1  
**Effort:** 2 days

**Description:**
Need automated tests for cross-platform messaging.

**Test Cases:**
- [ ] Web → Android message delivery
- [ ] Web → iOS message delivery
- [ ] Android → iOS message delivery
- [ ] Multi-platform mesh routing
- [ ] File transfer between platforms
- [ ] QR pairing (mobile)
- [ ] Persistence across all platforms

---

### Issue #22: Accessibility Audit
**Priority:** P1  
**Effort:** 2 days

**Description:**
No accessibility testing performed. Need to audit and fix.

**Requirements:**
- [ ] Screen reader testing (all platforms)
- [ ] Keyboard navigation (web)
- [ ] Color contrast check
- [ ] Font scaling (mobile)
- [ ] ARIA labels (web)
- [ ] Content descriptions (Android)
- [ ] VoiceOver testing (iOS)

---

### Issue #23: Performance Testing
**Priority:** P2  
**Effort:** 2 days

**Description:**
No performance benchmarks. Need to measure and optimize.

**Metrics:**
- [ ] Message send latency (<100ms target)
- [ ] Connection setup time (<2s target)
- [ ] Memory usage (<100MB target)
- [ ] Messages per second (1000+ target)
- [ ] Concurrent peers (50+ target)
- [ ] Mobile battery drain (<5%/hr target)

---

## Issue Creation Commands

Use these to create GitHub issues:

```bash
# Critical Issues (P0)
gh issue create --title "Integrate data persistence across all platforms" --body-file issue_templates/issue_1.md --label "P0,blocker,persistence"
gh issue create --title "Implement user onboarding flow" --body-file issue_templates/issue_2.md --label "P0,ux,onboarding"
gh issue create --title "Integrate Android chat UI with service" --body-file issue_templates/issue_3.md --label "P0,blocker,android"
gh issue create --title "Standardize terminology across platforms" --body-file issue_templates/issue_4.md --label "P0,ux,consistency"

# High Priority (P1)
gh issue create --title "Implement notification system" --body-file issue_templates/issue_5.md --label "P1,feature,notifications"
gh issue create --title "Add QR code scanner to web" --body-file issue_templates/issue_6.md --label "P1,feature,web"
gh issue create --title "Wire up settings functionality" --body-file issue_templates/issue_7.md --label "P1,feature,settings"
gh issue create --title "Add privacy and security explanations" --body-file issue_templates/issue_8.md --label "P1,ux,documentation"
gh issue create --title "Add in-app help system" --body-file issue_templates/issue_9.md --label "P1,ux,documentation"
gh issue create --title "Complete media features" --body-file issue_templates/issue_10.md --label "P1,feature,media"

# Medium Priority (P2)
gh issue create --title "Implement read receipts" --body-file issue_templates/issue_11.md --label "P2,feature,messaging"
gh issue create --title "Implement typing indicators" --body-file issue_templates/issue_12.md --label "P2,feature,messaging"
gh issue create --title "Add emoji picker" --body-file issue_templates/issue_13.md --label "P2,feature,mobile"
gh issue create --title "Implement message search" --body-file issue_templates/issue_14.md --label "P2,feature,mobile"
gh issue create --title "Add message reactions" --body-file issue_templates/issue_15.md --label "P2,feature,messaging"
gh issue create --title "Implement group messaging" --body-file issue_templates/issue_16.md --label "P2,feature,messaging"
gh issue create --title "Add video calling" --body-file issue_templates/issue_17.md --label "P2,feature,web"

# Documentation
gh issue create --title "Create platform user guides" --body-file issue_templates/issue_18.md --label "P1,documentation"
gh issue create --title "Create developer guides" --body-file issue_templates/issue_19.md --label "P2,documentation"
gh issue create --title "Update README with audit findings" --body-file issue_templates/issue_20.md --label "P1,documentation"

# Testing
gh issue create --title "Cross-platform integration tests" --body-file issue_templates/issue_21.md --label "P1,testing"
gh issue create --title "Accessibility audit" --body-file issue_templates/issue_22.md --label "P1,testing,accessibility"
gh issue create --title "Performance testing" --body-file issue_templates/issue_23.md --label "P2,testing,performance"
```

---

## Progress Tracking

Use this checklist to track completion:

### Week 1: Data Persistence (P0)
- [ ] Issue #1: Data persistence (Web)
- [ ] Issue #1: Data persistence (Android)
- [ ] Issue #1: Data persistence (iOS)

### Week 2: Core UX (P0)
- [ ] Issue #2: Onboarding (Web)
- [ ] Issue #2: Onboarding (Android)
- [ ] Issue #2: Onboarding (iOS)
- [ ] Issue #3: Android chat integration
- [ ] Issue #4: Terminology standardization

### Week 3: Feature Parity (P1)
- [ ] Issue #5: Notifications (Web)
- [ ] Issue #5: Notifications (Android)
- [ ] Issue #5: Notifications (iOS)
- [ ] Issue #6: Web QR scanner
- [ ] Issue #7: Settings functionality
- [ ] Issue #10: Media features

### Week 4: Testing & Documentation (P1)
- [ ] Issue #8: Privacy explanations
- [ ] Issue #9: Help system
- [ ] Issue #18: User guides
- [ ] Issue #20: README update
- [ ] Issue #21: Integration tests
- [ ] Issue #22: Accessibility audit

### Post V1 (P2)
- [ ] Issues #11-17: Advanced features
- [ ] Issue #19: Developer guides
- [ ] Issue #23: Performance testing

---

**Document Created:** November 17, 2024  
**Last Updated:** November 17, 2024  
**Status:** Ready for implementation
