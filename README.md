# Sovereign Communications

[![CI Status](https://github.com/Treystu/SC/workflows/Unified%20CI%2FCD/badge.svg)](https://github.com/Treystu/SC/actions/workflows/unified-ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A scalable, decentralized, end-to-end encrypted mesh networking platform designed for **1,000,000+ users** with complete sovereignty.

## 🚀 Rollout Status & Roadmap

> **Current Focus:** Phase 7 Scability (DHT) & Phase 6 Privacy (Sovereignty)

Please refer to **[V1_ROLLOUT_MASTER_PLAN.md](V1_ROLLOUT_MASTER_PLAN.md)** for the single source of truth regarding the roadmap, active workstreams, and release planning.

## 🌟 Core Pillars

1.  **Sovereignty**: No central servers. Users own their identity and data.
2.  **Scalability**: Distributed Hash Table (DHT) architecture to support millions of nodes.
3.  **Security**: Zero-Trust architecture, perfect forward secrecy, and metadata protection.
4.  **Resilience**: Works offline, over local mesh (BLE/WiFi Direct), and traditional networks.

## 🏗️ Architecture

The project is organized as a monorepo:

```
SC/
├── core/           # Shared cryptography, protocol, and DHT logic (TypeScript)
├── web/            # Web application (PWA, React, WebRTC)
├── android/        # Android application (Kotlin, BLE, WiFi Direct)
├── ios/            # iOS application (Swift, BLE)
└── docs/           # Documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- For Android: Android Studio with Kotlin support
- For iOS: Xcode with Swift support

### Installation

1. Clone the repository:

```bash
git clone https://github.com/Treystu/SC.git
cd SC
```

2. Install dependencies:

```bash
npm install
```

3. Build the core library:

```bash
cd core
npm run build
npm test
```

4. Run the web application:

```bash
cd ../web
npm install
npm run dev
```

The web app will be available at `http://localhost:3000`

## 📦 Core Library

The `@sc/core` library provides the foundational cryptography and networking primitives used across all platforms. It uses **Ed25519** for signing and **XChaCha20-Poly1305** for encryption.

## 🧪 Testing

```bash
# Run core library tests (1045+ tests)
cd core
npm test

# Run web application tests (35+ tests)
cd web
npm test
```

## 🔐 Identity System

The platform uses a unified identity format:
- **16-character uppercase hex** peer IDs derived from Ed25519 public key fingerprints
- Consistent across all components: mesh network, room signaling, storage
- Single identity per device, persisted in IndexedDB

## 🤝 Contributing

See [V1_ROLLOUT_MASTER_PLAN.md](V1_ROLLOUT_MASTER_PLAN.md) for active tasks.

## 📄 License

MIT License - See LICENSE file for details
