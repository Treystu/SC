# Developer Onboarding Guide

Welcome to Sovereign Communications! This guide will help you get started contributing to the project.

## Prerequisites

### Required Software

- **Node.js** 18+ and npm
- **Git** 2.30+
- For Android development:
  - Android Studio with Kotlin support
  - Android SDK API 24+
  - Gradle 8.0+
- For iOS development:
  - Xcode 14+ with Swift 5.10+
  - iOS 15+ SDK
  - CocoaPods

### Recommended Tools

- **VS Code** with extensions:
  - TypeScript Vue Plugin (Volar)
  - ESLint
  - Prettier
  - Jest Runner
- **Postman** or **Insomnia** for API testing
- **Git GUI** (GitKraken, SourceTree, or GitHub Desktop)

## Project Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Treystu/SC.git
cd SC
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
npm install

# This will install dependencies for:
# - Root workspace
# - core/ (TypeScript library)
# - web/ (React application)
```

### 3. Build the Core Library

```bash
cd core
npm run build
```

This compiles the TypeScript core library that's used by all platforms.

### 4. Run Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- crypto/primitives.test.ts
```

### 5. Start the Web Application

```bash
cd web
npm run dev
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
SC/
├── core/                   # Core TypeScript library (@sc/core)
│   ├── src/
│   │   ├── crypto/        # Cryptographic primitives
│   │   ├── protocol/      # Binary message format
│   │   ├── mesh/          # Routing and peer management
│   │   ├── transport/     # WebRTC, BLE abstractions
│   │   ├── transfer/      # File transfer
│   │   └── discovery/     # Peer discovery
│   ├── package.json
│   └── tsconfig.json
│
├── web/                    # Web application (React + Vite)
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── storage/       # IndexedDB wrapper
│   │   └── utils/         # Utility functions
│   ├── public/            # Static assets
│   ├── package.json
│   └── vite.config.ts
│
├── android/                # Android application (Kotlin)
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/      # Kotlin source code
│   │   │   └── res/       # Resources (layouts, strings)
│   │   └── build.gradle
│   └── settings.gradle
│
├── ios/                    # iOS application (Swift)
│   ├── SC/
│   │   ├── Models/        # Data models
│   │   ├── Views/         # SwiftUI views
│   │   └── Managers/      # Service managers
│   └── SC.xcodeproj/
│
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md    # System architecture
│   ├── API.md            # API reference
│   ├── SECURITY.md       # Security model
│   └── protocol.md       # Protocol specification
│
└── tests/                  # Integration tests
    └── playwright/        # E2E tests
```

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

Follow the coding standards (see below).

### 3. Write Tests

Every feature should have corresponding tests:

```typescript
// Example test in core/src/crypto/primitives.test.ts
describe('Cryptographic Primitives', () => {
  it('should sign and verify messages correctly', async () => {
    const identity = generateIdentity();
    const message = new TextEncoder().encode('Hello, mesh!');
    const signature = signMessage(message, identity.privateKey);
    const isValid = verifySignature(message, signature, identity.publicKey);
    expect(isValid).toBe(true);
  });
});
```

### 4. Run Tests and Linting

```bash
# Run tests
npm test

# Run linter
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### 5. Commit Your Changes

We follow conventional commits:

```bash
git add .
git commit -m "feat: add voice message recording"
git commit -m "fix: resolve WebRTC connection issue"
git commit -m "docs: update API reference"
```

Commit types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or tooling changes

### 6. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript strict mode
- Prefer `const` over `let`, never use `var`
- Use arrow functions for callbacks
- Use template literals for strings
- Write JSDoc comments for public APIs
- Use async/await instead of callbacks

Example:

```typescript
/**
 * Encrypt a message using session key
 * @param plaintext - Message to encrypt
 * @param sessionKey - Encryption key
 * @returns Encrypted ciphertext with authentication tag
 */
export async function encryptMessage(
  plaintext: Uint8Array,
  sessionKey: Uint8Array
): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(24));
  const cipher = chacha20poly1305(sessionKey, nonce);
  return cipher.encrypt(plaintext);
}
```

### Code Style

- 2-space indentation
- Use semicolons
- Max line length: 100 characters
- No trailing whitespace
- Newline at end of file

### React Components

- Use functional components with hooks
- Extract custom hooks for reusable logic
- Use TypeScript for props

Example:

```typescript
interface MessageProps {
  content: string;
  timestamp: number;
  senderId: string;
}

export const Message: React.FC<MessageProps> = ({ content, timestamp, senderId }) => {
  const formattedTime = new Date(timestamp).toLocaleTimeString();
  
  return (
    <div className="message">
      <div className="message-content">{content}</div>
      <div className="message-metadata">
        <span className="sender">{senderId}</span>
        <span className="time">{formattedTime}</span>
      </div>
    </div>
  );
};
```

### Android (Kotlin)

- Follow Kotlin coding conventions
- Use Jetpack Compose for UI
- Use coroutines for async operations
- Follow MVVM architecture pattern

### iOS (Swift)

- Follow Swift API design guidelines
- Use SwiftUI for UI
- Use async/await for async operations
- Follow MVVM architecture pattern

## Testing Guidelines

### Unit Tests

- Test individual functions and classes
- Mock external dependencies
- Aim for >80% code coverage
- Use descriptive test names

```typescript
describe('RoutingTable', () => {
  describe('addPeer', () => {
    it('should add peer to routing table', () => {
      const table = new RoutingTable();
      const peer = createPeer('peer-1', publicKey, 'webrtc');
      table.addPeer(peer);
      expect(table.hasPeer('peer-1')).toBe(true);
    });
    
    it('should update existing peer', () => {
      const table = new RoutingTable();
      const peer = createPeer('peer-1', publicKey, 'webrtc');
      table.addPeer(peer);
      table.addPeer({ ...peer, lastSeen: Date.now() + 1000 });
      const updated = table.getPeer('peer-1');
      expect(updated?.lastSeen).toBeGreaterThan(peer.lastSeen);
    });
  });
});
```

### Integration Tests

- Test interaction between components
- Use real dependencies when possible
- Test error scenarios

### E2E Tests

- Test complete user workflows
- Use Playwright for web
- Use Espresso for Android
- Use XCTest for iOS

## Debugging

### Web Application

1. Open browser DevTools (F12)
2. Check Console for errors
3. Use Network tab to inspect WebRTC
4. Use Application > IndexedDB to inspect storage

### Core Library

1. Add `console.log` or use debugger
2. Run tests in watch mode: `npm test -- --watch`
3. Use VS Code debugger with Jest

### Android Application

1. Use Android Studio debugger
2. View Logcat for system logs
3. Use Layout Inspector for UI debugging

### iOS Application

1. Use Xcode debugger
2. View Console for logs
3. Use View Hierarchy inspector

## Common Tasks

### Adding a New Feature

1. **Define the feature** in an issue or design doc
2. **Update the protocol** if needed (docs/protocol.md)
3. **Implement in core library** (core/src/)
4. **Write tests** (core/src/*.test.ts)
5. **Add UI components** (web/src/components/)
6. **Update documentation** (docs/)
7. **Create PR** with description and screenshots

### Adding a New Message Type

1. Add to `MessageType` enum in `core/src/protocol/message.ts`
2. Update encoder/decoder in `protocol/message.ts`
3. Add handler in mesh network
4. Update documentation

Example:

```typescript
export enum MessageType {
  TEXT = 0x01,
  FILE_METADATA = 0x02,
  FILE_CHUNK = 0x03,
  VOICE = 0x04,
  NEW_TYPE = 0x05,  // Add new type
}
```

### Adding a New Cryptographic Primitive

1. Research and choose audited library
2. Implement wrapper in `core/src/crypto/`
3. Add comprehensive tests
4. Document security properties
5. Update security documentation

### Optimizing Performance

1. Identify bottleneck using profiler
2. Write benchmark test
3. Implement optimization
4. Verify improvement with benchmark
5. Document optimization technique

## Resources

### External Documentation

- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Ed25519](https://ed25519.cr.yp.to/)
- [ChaCha20-Poly1305](https://tools.ietf.org/html/rfc8439)
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Internal Documentation

- [Architecture](./ARCHITECTURE.md) - System design and data flow
- [API Reference](./API.md) - Complete API documentation
- [Protocol Specification](./protocol.md) - Binary protocol details
- [Security Model](./SECURITY.md) - Cryptographic design
- [User Guide](./USER_GUIDE.md) - End-user documentation

## Getting Help

### Ask Questions

- **GitHub Discussions**: For general questions
- **GitHub Issues**: For bug reports and feature requests
- **Code Reviews**: For feedback on your code

### Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues and solutions.

## Contributing Guidelines

1. **Code Quality**: Follow coding standards and write tests
2. **Documentation**: Update docs for user-facing changes
3. **Commits**: Use conventional commit messages
4. **PRs**: Provide clear description and context
5. **Reviews**: Be respectful and constructive
6. **Security**: Never commit secrets or credentials

## Next Steps

1. ✅ Set up development environment
2. ✅ Run the application locally
3. 📖 Read the architecture documentation
4. 🔍 Explore the codebase
5. 🐛 Find an issue to work on
6. 💻 Make your first contribution!

## Welcome to the Team! 🎉

We're excited to have you contributing to Sovereign Communications. If you have any questions, don't hesitate to ask in GitHub Discussions.

Happy coding! 🚀
