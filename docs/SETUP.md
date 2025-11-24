# Development Setup Guide

This guide will help you set up your development environment for Sovereign Communications.

## Prerequisites

### All Platforms
- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **npm** 9.x or higher (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

### Platform-Specific

#### Web Development
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- No additional requirements

#### Android Development
- **Android Studio** Hedgehog (2023.1.1) or newer
- **Android SDK** API Level 24 or higher
- **Kotlin** 1.9 or higher
- **JDK** 17 or higher

#### iOS Development
- **macOS** Ventura (13.0) or newer
- **Xcode** 15.0 or newer
- **Swift** 5.9 or higher
- Apple Developer account (for device testing)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Treystu/SC.git
cd SC
```

### 2. Install Dependencies

```bash
# Install root dependencies
npm install

# Install core library dependencies
cd core
npm install

# Build core library
npm run build

# Run tests to verify setup
npm test
```

Expected output:
```
 PASS  src/mesh/routing.test.ts
 PASS  src/protocol/message.test.ts
 PASS  src/crypto/primitives.test.ts

Test Suites: 3 passed, 3 total
Tests:       38 passed, 38 total
```

### 3. Set Up Web Application

```bash
cd ../web
npm install

# Start development server
npm run dev
```

The web app will be available at `http://localhost:3000`

## Project Structure

```
SC/
├── core/                   # Shared cryptography and protocol library
│   ├── src/
│   │   ├── crypto/        # Cryptographic primitives
│   │   │   ├── primitives.ts      # Ed25519, X25519, XChaCha20
│   │   │   ├── primitives.test.ts # Crypto tests
│   │   │   └── storage.ts         # Secure key storage
│   │   ├── protocol/      # Message protocol
│   │   │   ├── message.ts         # Binary message format
│   │   │   └── message.test.ts    # Protocol tests
│   │   ├── mesh/          # Mesh networking
│   │   │   ├── routing.ts         # Routing table & peer management
│   │   │   └── routing.test.ts    # Routing tests
│   │   └── index.ts       # Main exports
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── web/                    # Web application (React + TypeScript)
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── ChatView.tsx
│   │   │   ├── ConversationList.tsx
│   │   │   └── ConnectionStatus.tsx
│   │   ├── App.tsx        # Main app component
│   │   ├── main.tsx       # Entry point
│   │   └── index.css      # Global styles
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── android/                # Android application (planned)
├── ios/                    # iOS application (planned)
├── docs/                   # Documentation
│   ├── protocol.md        # Protocol specification
│   └── security.md        # Security model
├── package.json           # Root package.json (workspace)
├── .gitignore
└── README.md
```

## Development Workflow

### Core Library Development

```bash
cd core

# Run tests in watch mode
npm run dev

# Run specific test file
npm test -- primitives.test.ts

# Run tests with coverage
npm test -- --coverage

# Build library
npm run build
```

### Web Application Development

```bash
cd web

# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Running the Full Stack

From the root directory:

```bash
# Build everything
npm run build

# Run all tests
npm test

# Start web dev server
npm run dev
```

## Common Tasks

### Adding New Cryptographic Functions

1. Add function to `core/src/crypto/primitives.ts`
2. Write tests in `core/src/crypto/primitives.test.ts`
3. Export from `core/src/index.ts`
4. Run tests: `cd core && npm test`

### Creating New React Components

1. Create component file in `web/src/components/`
2. Create corresponding CSS file
3. Import and use in parent component
4. Test in browser: `cd web && npm run dev`

### Updating Message Protocol

1. Modify `core/src/protocol/message.ts`
2. Update tests in `core/src/protocol/message.test.ts`
3. Update protocol documentation in `docs/protocol.md`
4. Rebuild: `cd core && npm run build`

## Testing

### Unit Tests (Core Library)

```bash
cd core
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report
npm test -- primitives     # Run specific test
```

### Manual Testing (Web App)

1. Start dev server: `cd web && npm run dev`
2. Open browser to `http://localhost:3000`
3. Test UI interactions
4. Check browser console for errors
5. Verify network requests in DevTools

### End-to-End Testing (Future)

Will use Playwright for automated browser testing.

## Building for Production

### Web Application

```bash
cd web
npm run build

# Output will be in web/dist/
# Serve with any static file server:
npm run preview
```

### Android Application (Future)

```bash
cd android
./gradlew assembleRelease

# APK will be in android/app/build/outputs/apk/release/
```

### iOS Application (Future)

```bash
cd ios
xcodebuild -scheme SC -configuration Release
```

## Troubleshooting

### Build Errors

**Problem**: `Cannot find module '@sc/core'`
```bash
# Solution: Build core library first
cd core && npm run build
```

**Problem**: TypeScript errors in web app
```bash
# Solution: Update dependencies
cd web && npm install
```

### Test Failures

**Problem**: Crypto tests failing
```bash
# Solution: Check Node.js version (need 18+)
node --version

# Update if needed
nvm install 18
nvm use 18
```

### Development Server Issues

**Problem**: Port 3000 already in use
```bash
# Solution: Change port in web/vite.config.ts
server: {
  port: 3001,  // Use different port
}
```

**Problem**: Hot reload not working
```bash
# Solution: Restart dev server
# Press Ctrl+C to stop
npm run dev
```

## Code Style

### TypeScript

- Use strict type checking
- Prefer interfaces over types for objects
- Use meaningful variable names
- Document complex functions

### React

- Use functional components with hooks
- Keep components small and focused
- Extract logic into custom hooks
- Use CSS modules or styled components

### Testing

- Write tests before fixing bugs (TDD)
- Aim for >80% code coverage
- Test edge cases and error conditions
- Use descriptive test names

## Git Workflow

### Branching

```bash
# Create feature branch
git checkout -b feature/add-webrtc

# Make changes and commit
git add .
git commit -m "Add WebRTC peer connection support"

# Push to remote
git push origin feature/add-webrtc
```

### Commit Messages

Follow conventional commits format:

```
feat: add WebRTC peer connection
fix: resolve message deduplication bug
docs: update protocol specification
test: add tests for routing table
refactor: simplify message encoding
```

## Getting Help

- **Documentation**: Check `/docs` folder
- **Issues**: Open GitHub issue
- **Discussions**: Use GitHub Discussions
- **Security**: Email security@example.com (do not open public issue)

## Next Steps

1. **Explore the Code**: Read through the core library
2. **Run Tests**: Make sure everything works
3. **Read Docs**: Understand the protocol and security model
4. **Start Coding**: Pick an issue and start contributing!

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Jest Testing Framework](https://jestjs.io/)
- [@noble/curves Documentation](https://github.com/paulmillr/noble-curves)
- [Ed25519 Specification (RFC 8032)](https://tools.ietf.org/html/rfc8032)

## License

MIT License - See LICENSE file for details
