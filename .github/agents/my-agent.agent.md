# Sovereign Communications — Copilot Agent Guide

## Core Directive
You are assisting on Sovereign Communications (SC), a **truly serverless, P2P, decentralized, end-to-end encrypted mesh networking platform** spanning Web, Android, and iOS. There are **no central servers**. Every action must preserve **sovereignty**, **privacy**, and **resilience**. The goal is to enable global, censorship-resistant communication that can operate over any available medium.

## Architectural Tenets
- **Serverless & P2P**: No reliance on centralized infrastructure. Peers form ad-hoc meshes.
- **Transport Agnostic Mesh**: WebRTC data channels, LAN, internet, Bluetooth LE, and even sneakernet/offline relays. Favor multi-path, opportunistic connectivity.
- **Routing**: Mesh routing with flood algorithms, TTL, deduplication (SHA-256 hash cache), multi-hop support, and peer health metrics.
- **Performance Targets**: 1000+ msgs/sec, 100+ concurrent peers, <100ms relay latency, <100MB core memory footprint.
- **Resilience**: Adaptive heartbeats, partition tolerance, rate limiting, flood detection, peer blacklisting.

## Security & Cryptography
- **Primitives**: Ed25519 signing, X25519 key exchange, XChaCha20-Poly1305 encryption. Use audited libs (@noble/curves, @noble/ciphers). Never roll your own crypto.
- **Message Auth**: All messages signed. Use constant-time ops where applicable. Validate all inputs.
- **Perfect Forward Secrecy**: Automatic session key rotation.
- **Verification**: Public key fingerprints for OOB verification.
- **DoS Protection**: Rate limiting, flood detection, blacklisting, TTL enforcement, deduplication.

## Protocol & Messages
- **Binary format** with a **109-byte header**.
- **Required behaviors**: header validation, TTL decrement, dedup cache, signature verification, and proper padding of compact signatures (65-byte Ed25519 with recovery byte placeholder).
- **Fragmentation/Reassembly**: Support fragmenting large messages; reassemble via `MessageReassembler`-style logic.

## Platform Notes
- **Core** (`core/`): TS library for crypto, protocol, mesh, transport abstractions.
- **Web** (`web/`): React 18 + TS + Vite PWA.
- **Android** (`android/`): Kotlin + Jetpack Compose; foreground service for connectivity.
- **iOS** (`ios/`): Swift + SwiftUI (planned).
- **Docs/Tests**: Keep README and docs updated; maintain high-coverage Jest tests.

## Coding Standards
- **TypeScript/JS**: Strict mode; async/await; functional bias; 2-space indent; const/let; template literals; arrow callbacks; prefer interfaces; JSDoc for public APIs.
- **Testing**: Jest; descriptive names (“should [behavior] when [condition]”); beforeEach/afterEach; target >80% coverage.
- **Security**: Validate all inputs; document assumptions; avoid side channels; never introduce centralized dependencies.

## Mesh & Peer Management
- Deduplicate messages (SHA-256 cache).
- Enforce TTL to prevent loops.
- Track peer reputation/health; adaptive heartbeats.
- Blacklist problematic peers with expiry; support partition healing.
- Multi-hop routing with metrics; prefer multiple concurrent paths.

## Humanity & Impact
This project aims to provide **sovereign, censorship-resistant communication** for everyone. Treat every design choice as protecting human rights: privacy, safety, and free expression across borders and during crises. Optimize for resilience in adverse conditions and ensure accessibility across all transports, including low-connectivity and offline scenarios.

## What NOT to do
- No central servers or hidden control planes.
- No proprietary, unaudited cryptography.
- No data collection, tracking, or analytics that compromise sovereignty.
- No assumptions of stable internet—always offer local/BTLE/sneakernet paths.

## Developer Workflow
- Build: `npm install`; `cd core && npm run build`; `cd web && npm run build`.
- Test: `npm test` (or `npm test -- --coverage`; specific: `npm test -- routing.test.ts`).
- Lint: `npm run lint`.

## When in Doubt
- Preserve decentralization and privacy.
- Prefer secure, audited primitives.
- Favor interoperability across transports.
- Document decisions and security assumptions.
- Ask for clarification before adding any centralized dependency.
