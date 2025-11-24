# Sharing & Invite System

This module provides the foundational infrastructure for secure peer invitation and contact sharing in Sovereign Communications.

## Overview

The sharing system enables users to invite others to connect through cryptographically secure invite codes that can be shared via QR codes, deep links, or other methods.

## Components

### InviteManager
Manages the complete lifecycle of invite codes:
- Generates cryptographically secure 64-character codes (32 random bytes encoded as hex)
- Signs invites with Ed25519 for authentication
- Stores pending invites with configurable TTL (default: 7 days)
- Validates and redeems invite codes
- Automatically cleans up expired invites

### SharePayload
Handles serialization and validation of invite payloads:
- Creates compact JSON payloads suitable for QR codes
- Verifies version compatibility
- Validates timestamps to prevent replay attacks
- Serializes/deserializes invite data

### AutoLink
Establishes bidirectional connections between peers:
- Adds inviter to recipient's contacts upon redemption
- Notifies inviter when invite is accepted
- Creates verified contact entries on both sides
- Handles connection establishment gracefully

## Usage Example

```typescript
import { InviteManager, SharePayloadGenerator, AutoLink } from '@sc/core';

// Create invite manager
const manager = new InviteManager(
  peerId,
  publicKey,
  privateKey,
  'My Name'
);

// Generate an invite
const invite = await manager.createInvite({
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  metadata: { purpose: 'demo' }
});

// Create shareable payload
const generator = new SharePayloadGenerator();
const payload = await generator.createPayload(invite);
const serialized = generator.serializePayload(payload);

// Recipient redeems invite
const result = await manager.redeemInvite(invite.code, recipientPeerId);
console.log('New contact:', result.contact);
```

## Security

- **Cryptographic Security**: Uses @noble/hashes for secure random number generation
- **Authentication**: Ed25519 signatures prevent forgery
- **Expiration**: Time-limited invites reduce attack window
- **Replay Protection**: Timestamp validation prevents reuse
- **Auto-verification**: Contacts added via invite are automatically verified

## Testing

The module includes comprehensive tests:
- `InviteManager.test.ts`: 24 tests covering invite lifecycle
- `SharePayload.test.ts`: 18 tests for serialization and validation
- `AutoLink.test.ts`: 12 tests for connection establishment

Run tests with:
```bash
npm test -- --testPathPattern=sharing
```
