# Unified ID Naming Convention

**Date:** 2026-01-24  
**Status:** Specification

## Overview

This document defines the standard naming convention for peer/user IDs throughout the codebase. With multiple transport layers (P2P WebRTC, Server Relay, Multi-hop Mesh), it's critical to distinguish between:

1. **Original/Ultimate IDs** - The message author and final recipient
2. **Hop/Relay IDs** - Intermediate nodes in the delivery chain

## ID Terminology

### Message Context

| Field Name                           | Description                                                         | Example                         |
| ------------------------------------ | ------------------------------------------------------------------- | ------------------------------- |
| `authorId` / `originalSenderId`      | The peer who **created/wrote** the message                          | User A who typed "Hello"        |
| `destinationId` / `finalRecipientId` | The peer who should **receive and read** the message                | User B who should see "Hello"   |
| `from`                               | The **immediate sender** of this transmission (could be a relay)    | User A (direct) or Relay Node R |
| `to`                                 | The **immediate recipient** of this transmission (could be a relay) | User B (direct) or Relay Node R |

### Peer Context

| Field Name     | Description                         | Example             |
| -------------- | ----------------------------------- | ------------------- |
| `localPeerId`  | The current user's own peer ID      | "ABC123..."         |
| `remotePeerId` | Another peer's ID                   | "XYZ789..."         |
| `peerId`       | Generic peer ID (context-dependent) | Used in loops, etc. |

## Transport Layer Mappings

### 1. Direct P2P WebRTC

No relay, so all IDs are the same:

```
authorId       = from           = localPeerId
destinationId  = to             = remotePeerId
```

### 2. Server Relay (Current Implementation)

Server acts as intermediary but doesn't modify message author:

```
Client Request:
  peerId (request header) = authorId (the sender)
  payload.to              = destinationId (final recipient)

Server Storage:
  from = authorId (preserved)
  to   = destinationId (preserved)

Server Poll Response:
  dms[].from = authorId (original sender)
  dms[].to   = destinationId (should match polling peer)
```

### 3. Multi-Hop Mesh (Future)

Each hop has its own from/to:

```
Original Message:
  authorId = "UserA"
  destinationId = "UserC"

Hop 1 (A -> B):
  from = "UserA"
  to = "UserB" (relay node)
  payload.authorId = "UserA"
  payload.destinationId = "UserC"

Hop 2 (B -> C):
  from = "UserB" (relay node)
  to = "UserC"
  payload.authorId = "UserA" (preserved!)
  payload.destinationId = "UserC"
```

## Normalization Rules

All peer IDs MUST be normalized before comparison:

```typescript
function normalizePeerId(id: string): string {
  return id.replace(/\s/g, "").toUpperCase();
}
```

## Loopback Prevention Checklist

### Server-Side (room.ts)

1. **DM Storage**: Reject if `peerId === to` (self-send)
2. **DM Poll**: Query `{ to: peerId, from: { $ne: peerId } }`

### Client-Side (useMeshNetwork.ts)

1. **P2P Handler**: Check `isLoopbackMessage(senderId, localPeerId)`
2. **Relay DM Handler**: Check `isLoopbackMessage(dm.from, localPeerId)`
3. **Message Payload**: Include `originalSenderId` for multi-hop scenarios

## Files Using These IDs

| File                              | ID Fields Used                                               |
| --------------------------------- | ------------------------------------------------------------ |
| `netlify/functions/room.ts`       | `peerId`, `from`, `to`                                       |
| `web/src/utils/RoomClient.ts`     | `peerId`, `to`                                               |
| `web/src/hooks/useMeshNetwork.ts` | `localPeerId`, `senderId`, `recipientId`, `originalSenderId` |
| `web/src/utils/messageParser.ts`  | `senderId`, `recipientId`, `originalSenderId`                |
| `web/src/App.tsx`                 | `selectedConversation` (= recipientId)                       |

## Migration TODO

- [ ] Rename `from` → `authorId` in server storage for clarity
- [ ] Rename `to` → `destinationId` in server storage for clarity
- [ ] Add `relayFrom` / `relayTo` for multi-hop scenarios
- [ ] Update TypeScript interfaces with JSDoc comments
- [ ] Add runtime validation for ID format consistency
