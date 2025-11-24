# Sovereign Communications - UI/UX Terminology Guide

**Version:** 1.0  
**Date:** November 17, 2025  
**Status:** Production Standard

## Purpose

This document defines standard terminology for all user-facing text across Web, Android, and iOS platforms to ensure a consistent user experience.

---

## Core Terminology

### Identity & Network

| Term | Usage | ❌ Avoid |
|------|-------|---------|
| **Peer ID** | Unique cryptographic identifier for a user | User ID, Address, Key |
| **Display Name** | Optional human-readable name (stored locally) | Username, Nickname |
| **Identity** | User's cryptographic keypair | Account, Profile |
| **Fingerprint** | Short hash of public key for verification | Hash, Checksum |

### Contacts & Messaging

| Term | Usage | ❌ Avoid |
|------|-------|---------|
| **Contact** | A peer you've added to your contact list | Peer, Friend, Connection |
| **Conversation** | Message thread with a contact | Chat, Thread, Room |
| **Message** | Individual text/media item sent/received | Text, Post, Note |

### Connections & Network

| Term | Usage | ❌ Avoid |
|------|-------|---------|
| **Connected** | Successfully established P2P connection | Online, Active |
| **Disconnected** | No active P2P connections | Offline, Inactive |
| **Mesh Network** | P2P network topology | Network, System |
| **Relay** | Message forwarded through intermediate peer | Forward, Route |

### Features

| Term | Usage | ❌ Avoid |
|------|-------|---------|
| **End-to-End Encrypted** | Messages encrypted between sender/receiver | Encrypted, Secure |
| **QR Code** | Visual code for sharing Peer ID | QR, Code, Barcode |
| **Demo Mode** | Testing mode with echo bot | Test Mode, Practice |

---

## Common UI Strings

### Buttons & Actions

```
✅ Correct                    ❌ Incorrect
"Add Contact"                 "Add Peer"
"Send Message"                "Send"
"Delete Conversation"         "Delete Chat"
"Connect to Contact"          "Connect to Peer"
"Share Peer ID"               "Share ID"
"Scan QR Code"                "Scan Code"
"Back Up Identity"            "Back Up Keys"
```

### Screen Titles

```
✅ Correct                    ❌ Incorrect
"Conversations"               "Chats" or "Messages"
"Contact Details"             "Peer Info"
"Settings"                    "Preferences" or "Options"
"Add Contact"                 "New Contact"
```

### Status Messages

```
✅ Correct                                    ❌ Incorrect
"Connected to 3 peers"                        "3 peers online"
"Contact added successfully"                  "Peer added"
"Message sent"                                "Sent"
"Failed to connect to contact"                "Connection failed"
"Your messages are end-to-end encrypted"      "Your messages are encrypted"
```

---

## Voice & Tone Guidelines

### Principles

1. **Clear & Direct** - Use simple, everyday language
2. **Empowering** - Emphasize user control and privacy
3. **Honest** - Be transparent about limitations
4. **Helpful** - Guide users without being patronizing

### Examples

**Privacy Features:**
- ✅ "All messages are end-to-end encrypted. Even we can't read them."
- ❌ "Messages are encrypted using XChaCha20-Poly1305 with Ed25519 signatures."

**Error Messages:**
- ✅ "Failed to connect. Make sure both devices are online."
- ❌ "WebRTC connection establishment failed."

**Onboarding:**
- ✅ "Welcome! Let's get you set up with secure messaging."
- ❌ "Initialize cryptographic identity and mesh network configuration."

---

## Platform-Specific Adaptations

### Android

- Follow Material Design 3 terminology conventions
- Use "Chats" → "Conversations" in tab labels
- Use system terminology (e.g., "Settings" not "Preferences")

### iOS

- Follow Apple Human Interface Guidelines
- Use iOS-native terms (e.g., "Share" instead of "Export")
- Respect iOS design patterns for actions

### Web

- Use web-standard terminology
- Clear call-to-action buttons
- Tooltips for technical terms

---

## Security & Privacy Language

### Required Disclosures

**Data Storage:**
```
"Your messages, contacts, and identity are stored only on your device. 
Make sure to back up your identity keys!"
```

**Encryption:**
```
"All messages are encrypted with Ed25519 signatures and 
XChaCha20-Poly1305 encryption."
```

**Decentralization:**
```
"Messages travel directly between devices using peer-to-peer connections. 
No data passes through our servers because we don't have any."
```

---

## Accessibility Considerations

### ARIA Labels

Use full, descriptive labels:
```tsx
// ✅ Good
<button aria-label="Add new contact">+</button>
<span aria-label="Peer ID abc123def456">abc1...</span>

// ❌ Bad  
<button aria-label="Add">+</button>
<span aria-label="ID">abc1...</span>
```

### Screen Reader Text

Announce important state changes:
```tsx
announce.message('Connected to 3 peers', 'polite');
announce.message('Failed to send message', 'assertive');
```

---

## Internationalization (i18n) Keys

### Key Naming Convention

```
{screen}.{element}.{property}

Examples:
conversation_list.empty.title
conversation_list.empty.subtitle
contact_detail.header.title
settings.identity.peer_id_label
```

### Common Translations (Future)

Prepare strings for localization:
- All user-facing text should use translation keys
- Avoid concatenating translated strings
- Use placeholders for dynamic content

---

## Implementation Checklist

### For Each New Feature

- [ ] All user-facing strings follow terminology guide
- [ ] ARIA labels are descriptive and consistent
- [ ] Error messages are helpful and actionable
- [ ] Success messages are encouraging
- [ ] Terminology is consistent across platforms

### For Existing Code Updates

- [ ] Replace "Chat" with "Conversation" where applicable
- [ ] Replace "Peer" with "Contact" in UI (not code)
- [ ] Use "Peer ID" consistently (not "ID" alone)
- [ ] Update button labels to match guide
- [ ] Update screen titles to match guide

---

## Review Process

1. **Development:** Follow this guide for all new UI text
2. **Code Review:** Check terminology consistency
3. **UX Review:** Verify user-facing language is clear
4. **Accessibility:** Test with screen readers

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-17 | Initial terminology guide |

---

**Questions or Suggestions?**  
Open an issue with the label `terminology` to propose changes to this guide.
