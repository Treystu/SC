# Cross-Platform Integration Testing Guide

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Comprehensive guide for testing Sovereign Communications across Web, Android, and iOS platforms

---

## Overview

This document provides detailed instructions for conducting cross-platform integration tests to ensure all three platforms (Web, Android, iOS) work together seamlessly for the V1 launch targeting 1,000,000 active users.

## Test Environment Setup

### Prerequisites

#### Web Testing
- Modern browser (Chrome, Firefox, Safari, or Edge)
- HTTPS-enabled local server or Netlify deploy preview
- Two separate browser profiles or devices for peer testing

#### Android Testing
- Physical Android device or emulator (API 26+)
- Android Studio Hedgehog or newer
- USB debugging enabled
- `ANDROID_HOME` environment variable set

#### iOS Testing
- Physical iOS device or simulator (iOS 15+)
- macOS with Xcode 15+
- Apple Developer account (for device testing)
- Provisioning profile configured

### Build All Platforms

```bash
# Build core library
cd core
npm run build

# Build web app
cd ../web
npm run build

# Build Android (requires ANDROID_HOME)
cd ../android
./gradlew assembleDebug

# Build iOS (macOS only)
cd ../ios
xcodebuild -scheme SovereignCommunications -sdk iphonesimulator build
```

---

## Test Matrix

### Platform Combinations

All combinations must be tested:

| Sender | Receiver | Priority | Status |
|--------|----------|----------|--------|
| Web → Web | Same device | P1 | ⏸️ |
| Web → Web | Different devices | P0 | ⏸️ |
| Web → Android | | P0 | ⏸️ |
| Web → iOS | | P0 | ⏸️ |
| Android → Web | | P0 | ⏸️ |
| Android → Android | Different devices | P1 | ⏸️ |
| Android → iOS | | P0 | ⏸️ |
| iOS → Web | | P0 | ⏸️ |
| iOS → Android | | P0 | ⏸️ |
| iOS → iOS | Different devices | P1 | ⏸️ |

**Total Test Scenarios:** 10 combinations × 8 test categories = 80 test cases

---

## Test Categories

### 1. Basic Messaging

**Objective:** Verify text messages send/receive across platforms

#### Test Steps

1. **Setup:**
   - Launch app on both platforms
   - Complete onboarding (if first launch)
   - Generate and note Peer IDs

2. **Add Contact:**
   - Platform A: Copy Peer ID
   - Platform B: Add contact manually (paste Peer ID)
   - Verify contact appears in list
   - Check connection status (should show "Connected")

3. **Send Message (A → B):**
   - Platform A: Select contact
   - Type message: "Test message from [Platform A] to [Platform B]"
   - Click Send
   - **Expected:** Message appears in A's chat view with "Sent" status

4. **Receive Message (B):**
   - **Expected:** Message appears in B's chat view within 5 seconds
   - **Expected:** Timestamp matches (within 1 second)
   - **Expected:** Sender shows correct Peer ID

5. **Send Reply (B → A):**
   - Platform B: Type reply: "Reply from [Platform B]"
   - Click Send
   - **Expected:** Message appears in B's chat view
   - **Expected:** Message appears in A's chat view within 5 seconds

**Acceptance Criteria:**
- ✅ Messages appear on both sides within 5 seconds
- ✅ Message order preserved
- ✅ Timestamps accurate
- ✅ No duplicates
- ✅ Connection remains stable

**Record Results:**
```
Test: Basic Messaging - Web → Android
Date: [DATE]
Tester: [NAME]
Pass/Fail: [PASS/FAIL]
Notes: [Any observations]
```

---

### 2. Persistence Testing

**Objective:** Verify messages persist across app restarts

#### Test Steps

1. **Send Messages:**
   - Exchange 5-10 messages between Platform A and B
   - Note the exact messages and timestamps

2. **Restart Platform A:**
   - Close app completely (force quit)
   - Relaunch app

3. **Verify History:**
   - **Expected:** All messages still visible
   - **Expected:** Message order preserved
   - **Expected:** Timestamps unchanged
   - **Expected:** Connection re-establishes automatically

4. **Send New Message:**
   - Platform A: Send new message
   - **Expected:** Platform B receives it
   - **Expected:** Message added to existing conversation

5. **Restart Platform B:**
   - Close app completely
   - Relaunch app
   - **Expected:** All messages (including latest) still visible

**Acceptance Criteria:**
- ✅ All messages persist across restarts
- ✅ No data loss
- ✅ Connection recovers automatically
- ✅ Message history loads quickly (<2 seconds)

---

### 3. Offline Queue Testing

**Objective:** Verify store-and-forward mechanism works

#### Test Steps

1. **Disconnect Platform B:**
   - Android/iOS: Enable airplane mode
   - Web: Disconnect network or close tab

2. **Send Messages from Platform A:**
   - Send 3 messages while B is offline
   - **Expected:** Messages show "Queued" status on A
   - **Expected:** No error messages
   - **Expected:** Messages saved to local database

3. **Verify Queue Persistence:**
   - Restart Platform A (with B still offline)
   - **Expected:** Queued messages still visible with "Queued" status

4. **Reconnect Platform B:**
   - Re-enable network/relaunch app
   - Wait for connection to establish

5. **Verify Delivery:**
   - **Expected:** All 3 messages deliver to B within 30 seconds
   - **Expected:** Messages show "Sent" status on A
   - **Expected:** Messages appear in correct order on B
   - **Expected:** Timestamps reflect original send time

**Acceptance Criteria:**
- ✅ Messages queue when peer offline
- ✅ Queue persists across app restarts
- ✅ Messages deliver automatically when peer returns
- ✅ No message loss
- ✅ Correct message order maintained

---

### 4. Multi-Hop Routing

**Objective:** Verify messages route through intermediate peers

#### Test Steps

1. **Setup Three Devices:**
   - Platform A, Platform B, Platform C
   - A connects to B
   - B connects to C
   - A does NOT connect directly to C

2. **Send Message (A → C):**
   - Platform A: Send message to C's Peer ID
   - **Expected:** Message routes through B
   - **Expected:** Message arrives at C within 10 seconds

3. **Verify Hop Count:**
   - Check message metadata (if exposed)
   - **Expected:** TTL decreased appropriately

4. **Send Reply (C → A):**
   - Platform C: Reply to A
   - **Expected:** Message routes back through B

**Acceptance Criteria:**
- ✅ Multi-hop routing works
- ✅ Messages arrive within acceptable time (<10s)
- ✅ No routing loops
- ✅ TTL enforced correctly

**Note:** Requires custom logging/debugging mode to verify routing path.

---

### 5. File Transfer

**Objective:** Verify file sharing across platforms

#### Test Steps

1. **Send Small File (A → B):**
   - Select file <1MB (image, PDF, etc.)
   - Send from Platform A
   - **Expected:** Progress indicator shows
   - **Expected:** File arrives at B complete
   - **Expected:** File opens correctly on B

2. **Send Large File (B → A):**
   - Select file 5-10MB
   - Send from Platform B
   - **Expected:** Chunking and reassembly work
   - **Expected:** Progress updates smoothly
   - **Expected:** File arrives complete

3. **Verify File Integrity:**
   - Compare file checksums
   - **Expected:** Files identical (MD5/SHA256 match)

**Acceptance Criteria:**
- ✅ Files transfer successfully
- ✅ Progress indicators accurate
- ✅ File integrity maintained
- ✅ No corruption
- ✅ Reasonable transfer speed

---

### 6. QR Code Pairing

**Objective:** Verify QR code contact exchange

#### Test Steps (Mobile Only)

1. **Platform A: Display QR Code:**
   - Navigate to "Share My ID" or similar
   - QR code displays on screen

2. **Platform B: Scan QR Code:**
   - Open camera/QR scanner
   - Scan Platform A's QR code
   - **Expected:** Contact added automatically
   - **Expected:** Connection established

3. **Verify Contact:**
   - Check contact list on B
   - **Expected:** A's Peer ID shown correctly
   - **Expected:** Can send message immediately

**Acceptance Criteria:**
- ✅ QR code displays correctly
- ✅ Scanner reads QR code
- ✅ Contact added automatically
- ✅ Connection works immediately

**Web:** Test with QR code display; scanner not required for V1.

---

### 7. Connection Recovery

**Objective:** Verify automatic reconnection after network issues

#### Test Steps

1. **Establish Connection:**
   - Platform A and B connected and messaging

2. **Simulate Network Interruption:**
   - Briefly disable/enable network on Platform A
   - Or: Switch WiFi to mobile data
   - **Expected:** Connection shows "Disconnected"

3. **Verify Auto-Reconnect:**
   - Wait up to 30 seconds
   - **Expected:** Connection recovers automatically
   - **Expected:** Status shows "Connected"

4. **Test Messaging:**
   - Send message from A to B
   - **Expected:** Message delivers successfully

**Acceptance Criteria:**
- ✅ Connection status updates accurately
- ✅ Auto-reconnect within 30 seconds
- ✅ No manual intervention required
- ✅ Messaging resumes normally

---

### 8. Performance & Scale

**Objective:** Verify performance under load

#### Test Steps

1. **High Message Volume:**
   - Send 100 messages rapidly (A → B)
   - **Expected:** All messages deliver
   - **Expected:** UI remains responsive
   - **Expected:** Memory usage stable

2. **Multiple Contacts:**
   - Connect to 5-10 different peers
   - Send messages to different contacts
   - **Expected:** All connections stable
   - **Expected:** No cross-contamination

3. **Large Conversation:**
   - Create conversation with 500+ messages
   - Scroll through history
   - **Expected:** Smooth scrolling
   - **Expected:** Fast loading (<2s)

**Acceptance Criteria:**
- ✅ Handles 100+ messages without issues
- ✅ Supports 10+ concurrent connections
- ✅ UI remains responsive
- ✅ Memory usage <100MB
- ✅ No crashes or freezes

---

## Testing Checklist

### Before Each Test Session

- [ ] Build latest code for all platforms
- [ ] Clear app data/caches (fresh state)
- [ ] Check network connectivity
- [ ] Note platform versions (OS, app version)
- [ ] Prepare test data (images, files, etc.)
- [ ] Set up screen recording (optional but recommended)

### During Testing

- [ ] Follow test steps precisely
- [ ] Record actual vs. expected results
- [ ] Note any anomalies or unexpected behavior
- [ ] Capture screenshots of issues
- [ ] Check logs for errors
- [ ] Monitor resource usage (CPU, memory, network)

### After Each Test

- [ ] Record pass/fail status
- [ ] Document any bugs found
- [ ] Create GitHub issues for failures
- [ ] Share results with team
- [ ] Update test status in tracking sheet

---

## Issue Reporting Template

When a test fails, create a GitHub issue with:

```markdown
## Test Failure: [Test Name]

**Platforms:** [Platform A] → [Platform B]  
**Test Category:** [e.g., Basic Messaging]  
**Date:** [Date]  
**Tester:** [Name]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happened]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Screenshots/Logs
[Attach screenshots, log files]

### Environment
- Platform A: [e.g., Web on Chrome 120]
- Platform B: [e.g., Android 13 on Pixel 6]
- App Version: [Version number]
- Network: [WiFi/Mobile data]

### Severity
- [ ] Critical (blocking V1)
- [ ] High (should fix before V1)
- [ ] Medium (fix in V1.1)
- [ ] Low (minor issue)
```

---

## Automated Testing (Future)

### Integration Test Framework

For V1.1, consider automating cross-platform tests:

```typescript
// Example: Automated cross-platform test
describe('Cross-Platform Messaging', () => {
  it('should send message from Web to Android', async () => {
    const webClient = await launchWebApp();
    const androidClient = await launchAndroidApp();
    
    await webClient.addContact(androidClient.peerId);
    await webClient.sendMessage('Hello Android!');
    
    const message = await androidClient.waitForMessage();
    expect(message.content).toBe('Hello Android!');
  });
});
```

**Tools to Consider:**
- Playwright (Web E2E)
- Appium (Mobile E2E)
- Detox (React Native, if applicable)
- Custom WebSocket test harness

---

## Test Result Tracking

### Status Dashboard

Track progress in a spreadsheet or GitHub Project:

| Test ID | Combination | Category | Status | Last Tested | Issues |
|---------|-------------|----------|--------|-------------|--------|
| T001 | Web → Web | Basic Messaging | ✅ Pass | 2025-12-08 | - |
| T002 | Web → Android | Basic Messaging | ⏸️ Pending | - | - |
| T003 | Web → iOS | Basic Messaging | ⏸️ Pending | - | - |
| ... | ... | ... | ... | ... | ... |

### Success Criteria for V1 Launch

**Minimum Requirements:**
- ✅ 100% of P0 tests passing (critical combinations)
- ✅ 90%+ of P1 tests passing (secondary combinations)
- ✅ 0 critical bugs
- ✅ All performance targets met

**Ideal State:**
- ✅ 100% of all tests passing
- ✅ 0 known bugs
- ✅ Automated test coverage
- ✅ Performance exceeds targets

---

## Timeline

### Week 1: Initial Testing
- Day 1-2: Set up test environment
- Day 3-4: Run P0 tests (critical combinations)
- Day 5: Document results, file issues

### Week 2: Bug Fixes & Retest
- Day 1-3: Fix critical bugs
- Day 4-5: Retest failed scenarios

### Week 3: Final Validation
- Day 1-2: Run full test suite
- Day 3-4: Performance benchmarking
- Day 5: Sign-off for V1 launch

---

## Resources

- [Platform Unification Guide](./PLATFORM_UNIFICATION_GUIDE.md)
- [V1 Production Readiness Assessment](../V1_PRODUCTION_READY_ASSESSMENT.md)
- [Terminology Guide](./TERMINOLOGY_GUIDE.md)
- [CONTRIBUTING.md](../CONTRIBUTING.md)

## Questions?

If you encounter issues during testing:
1. Check this guide for troubleshooting steps
2. Review GitHub issues for known problems
3. Ask in team chat or create a discussion
4. Document thoroughly for team review

---

**Document Maintainer:** QA Team  
**Last Updated:** December 2025  
**Next Review:** After each major test cycle
