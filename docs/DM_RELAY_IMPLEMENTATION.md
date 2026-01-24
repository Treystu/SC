# Direct Message Relay Implementation

**Date:** 2026-01-24
**Status:** Partially Working - Cleanup Required

## Overview

This document tracks the implementation of a server-side DM relay fallback for when P2P WebRTC connections fail (common in restrictive NAT environments).

## Architecture

**Design Goal:** This relay is designed to be **platform-agnostic** and work on ANY web deployment, not just Netlify.

```text
┌─────────────┐     P2P (preferred)     ┌─────────────┐
│   User A    │ ◄─────────────────────► │   User B    │
│  (Sender)   │                         │ (Recipient) │
└──────┬──────┘                         └──────┬──────┘
       │                                       │
       │  Relay Fallback (when P2P fails)      │
       ▼                                       ▼
┌──────────────────────────────────────────────────────┐
│            Serverless Function Endpoint               │
│              (/.netlify/functions/room)               │
│  ┌────────────────────────────────────────────────┐  │
│  │        Storage Backend (configurable)           │  │
│  │  { from, to, content, timestamp, read }         │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Supported Storage Backends

The `db.ts` utility supports multiple storage backends (auto-detected):

| Backend           | Priority        | Trigger                     | Notes                      |
| ----------------- | --------------- | --------------------------- | -------------------------- |
| **Netlify Blobs** | 1 (Primary)     | `NETLIFY_BLOBS_CONTEXT` env | Native serverless storage  |
| **MongoDB**       | 2 (Fallback)    | `MONGODB_URI` env           | For non-Netlify deploys    |
| **In-Memory**     | 3 (Last resort) | No external DB              | For local dev/testing only |

**For non-Netlify deployments:** Set `MONGODB_URI` environment variable to use MongoDB as the storage backend. Any MongoDB-compatible database (Atlas, self-hosted, etc.) will work.

## Components Modified

### 1. Backend: `netlify/functions/room.ts`

**New `dm` action:**

- Receives: `{ action: "dm", peerId, payload: { to, content, messageId } }`
- Stores DM in `dms` collection with `read: false`
- Content is assumed to be already E2E encrypted by client

**Updated `poll` action:**

- Now also fetches pending DMs from `dms` collection where `to: pollingPeerId`
- Marks fetched DMs as `read: true`
- Returns DMs alongside existing signals/peers/messages

### 2. Frontend: `web/src/utils/RoomClient.ts`

**New `dm()` method:**

```typescript
async dm(to: string, content: string): Promise<{ messageId, timestamp, relayed }>
```

- Sends DM through relay when P2P fails
- Returns relay confirmation

**Updated `poll()` return type:**

- Now includes `dms: RoomMessage[]` array

### 3. Frontend: `web/src/hooks/useMeshNetwork.ts`

**Relay fallback in `sendMessage`:**

- Attempts P2P first
- On P2P failure, uses `roomClientRef.current.dm()` for server relay
- Updates message status accordingly

**Processing relayed DMs in `pollLoop`:**

- Parses `dms` from poll response
- Extracts `text` from JSON payload
- Creates UI-ready message objects
- Persists to IndexedDB
- Creates/updates conversations

## Current Issues (2026-01-24)

### Issue 1: Echo/Duplicate Messages

**Symptom:** Messages appear multiple times in the conversation (sent, then echoed)
**Root Cause:** TBD - investigating whether this is:

- Client-side duplicate processing
- Message saved multiple times during P2P retry + relay fallback
- Poll returning stale/duplicate messages

### Issue 2: Raw JSON Display

**Symptom:** Some messages display as `{"text":"hello?","timestamp":...}` instead of parsed text
**Root Cause:** Incoming messages through certain paths are not being parsed
**Fix Required:** Add defensive JSON parsing for all incoming message paths

### Issue 3: Loopback Prevention

**Symptom:** Sender's own messages appearing in their received messages
**Root Cause:** Need to verify loopback prevention logic in DM processing

## Testing Results

### What Works ✅

1. Relay DM storage (verified via direct API calls)
2. Relay DM delivery to recipient (verified - "Hello Luke, testing relay" received)
3. Poll fetches correct DMs based on `to` field
4. Server correctly filters by `to: peerId` (no server-side loopback)

### What Needs Fixing ❌

1. Duplicate message display in UI
2. Raw JSON not being parsed in some message paths
3. Loopback causing sender to see their own messages as received

## TODO

- [ ] Fix message content parsing to always extract `text` from JSON payloads
- [ ] Add loopback prevention in DM processing (skip if `from === localPeerId`)
- [ ] Prevent duplicate message saves during P2P retry + relay fallback
- [ ] Add deduplication in database save operations
- [ ] Clean up stale test messages from database
- [ ] Add comprehensive logging for debugging relay flow

## Build Issues Resolved

1. **EBADPLATFORM error:** Removed `@rollup/rollup-linux-arm64-gnu` from package.json
2. **Netlify cache:** Force-cleared with `rm -rf node_modules` in build command
3. **Legacy peer deps:** Added `.npmrc` with `legacy-peer-deps=true`
