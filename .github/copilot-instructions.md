# GitHub Copilot Instructions for Sovereign Communications

## Project Overview
Sovereign Communications (SC) is a decentralized, end-to-end encrypted mesh networking platform.
- **Core Philosophy**: Sovereignty (no servers), Scalability (DHT), Security (Zero-Trust).
- **Monorepo**:
  - **`core/` (@sc/core)**: Shared TypeScript logic. **The Brain**. Crypto, Protocol, Mesh, DHT.
  - **`web/` (@sc/web)**: React 18 + Vite PWA. Uses `core-adapters` to interface with core.
  - **`android/`**: Native Android (Kotlin + Jetpack Compose).
  - **`ios/`**: Native iOS (Swift + SwiftUI).
  - **`tests/`**: Cross-platform integration & E2E tests.

## Critical Developer Workflows
- **Build Core First**: `npm run build -w core` (Required before building web or running tests).
- **Run Integration Tests**: `npm run test:integration` (Uses `jest.integration.config.js`).
- **Run E2E Tests**: `npm run test:e2e` (Playwright).
- **Local CI**: `npm run ci:local` (Lint + Build + Test).

## Architecture & Patterns

### 1. Core Protocol (Strict Binary Format)
- **Header Size**: **108 bytes** (Fixed).
- **Endianness**: Big Endian.
- **Signature**: 64 bytes (Ed25519 Compact). **Do NOT pad to 65 bytes.**
- **Message Structure**:
  ```typescript
  // core/src/protocol/message.ts
  export const HEADER_SIZE = 108;
  export interface Message {
    header: {
      version: number;      // 1 byte
      type: MessageType;    // 1 byte
      ttl: number;          // 1 byte (Max 255)
      reserved: number;     // 1 byte (0x00)
      timestamp: number;    // 8 bytes
      senderId: Uint8Array; // 32 bytes (Ed25519 PubKey)
      signature: Uint8Array;// 64 bytes (Ed25519 Sig)
    };
    payload: Uint8Array;
  }
  ```

### 2. Cryptography
- **Rule**: **NEVER** implement crypto primitives.
- **Library**: Use `@noble/curves` (Ed25519) and `@noble/ciphers` (XChaCha20).
- **Keys**: Public keys are 32 bytes. Signatures are 64 bytes.

### 3. Mesh Networking
- **Peers**: Defined in `core/src/mesh/routing.ts`.
- **State**: Use `PeerState` enum (CONNECTING, CONNECTED, etc.).
- **Routing**: Kademlia-based DHT.

### 4. Web Integration
- **Hooks**: Use `web/src/hooks/useMeshNetwork.ts` for mesh interaction.
- **Adapters**: Logic often lives in `web/src/core-adapters/` to bridge React and Core.

## Common Pitfalls
- **Signature Size**: Previous docs incorrectly stated 65 bytes. It is **64 bytes**.
- **TTL**: Always decrement TTL. Drop if <= 0 to prevent loops.
- **Build Order**: `core` must be built before `web` or `tests` will run.

## Documentation
- **Source of Truth**: The code in `core/src` is the ultimate truth.
- **Roadmap**: `V1_ROLLOUT_MASTER_PLAN.md`.
- **Protocol**: `core/src/protocol/message.ts`.
