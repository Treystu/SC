# Contributing to Sovereign Communications

Thank you for considering contributing to Sovereign Communications! This document provides guidelines and best practices for contributing to this project.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions. We're building software together to empower secure, decentralized communication.

## Monorepo Philosophy

Sovereign Communications is a **monorepo** containing multiple platforms that share a common core library (`@sc/core`). Understanding this architecture is crucial for effective contribution.

### Why a Monorepo?

- **Shared Logic**: Cryptography, protocol, and mesh networking code is shared across Web, Android, and iOS
- **Consistent Updates**: Changes to `@sc/core` automatically benefit all platforms
- **Unified Testing**: Core library has comprehensive tests that validate behavior for all platforms
- **Single Source of Truth**: Protocol specification and security model defined once

### Repository Structure

```
SC/
├── core/                   # @sc/core - Shared TypeScript library
│   ├── src/
│   │   ├── crypto/        # Ed25519, X25519, ChaCha20-Poly1305
│   │   ├── protocol/      # Binary message format
│   │   ├── mesh/          # Routing, peer management, health monitoring
│   │   ├── transport/     # WebRTC abstractions
│   │   └── discovery/     # Peer discovery mechanisms
│   └── package.json
├── web/                    # Web application (React + TypeScript)
│   ├── src/
│   └── package.json
├── android/                # Android app (Kotlin + Jetpack Compose)
├── ios/                    # iOS app (Swift + SwiftUI, planned)
├── docs/                   # Documentation
└── tests/                  # Integration and E2E tests
```

### Testing @sc/core Changes Across Platforms

When you modify the core library, you need to verify it works on all platforms:

#### 1. Test Core Library Directly

```bash
cd core
npm test                    # Run unit tests
npm test -- --coverage     # Check coverage >80%
```

#### 2. Test on Web

```bash
# Build core library first
cd core && npm run build

# Test in web app
cd ../web
npm run dev                # Manual testing
npm run build              # Verify production build
```

#### 3. Test on Android

```bash
# Build core library first
cd core && npm run build

# Build and test Android app
cd ../android
./gradlew assembleDebug    # Build APK
./gradlew test             # Run Android unit tests

# Manual testing on device/emulator
./gradlew installDebug
adb shell am start -n com.sovereign.communications/.ui.MainActivity
```

#### 4. Test on iOS (macOS only)

```bash
# Build core library first
cd core && npm run build

# Build and test iOS app
cd ../ios
xcodebuild -scheme SovereignCommunications -sdk iphonesimulator build
xcodebuild -scheme SovereignCommunications -sdk iphonesimulator test
```

#### 5. Run E2E Tests

```bash
# From repository root
npm run test:e2e           # Cross-platform E2E tests
npm run test:integration   # Integration tests
```

### Quick Commands for Monorepo Development

```bash
# Build everything (core, web, Android if available)
npm run build:all
# or
./scripts/build-all.sh

# Lint everything (TypeScript, Kotlin, Swift)
npm run lint:all
# or
./scripts/lint-all.sh

# Run full CI locally (lint, build, test)
npm run ci:local

# Build only core library
npm run build -w core

# Build only web app
npm run build -w web
```

## Getting Started

### Prerequisites

#### All Platforms
- **Node.js** 18+ and npm ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- **TypeScript** knowledge (strongly recommended)
- Understanding of cryptography basics (recommended for security-related work)

#### Web Development
- Modern web browser (Chrome, Firefox, Safari, or Edge)
- No additional requirements

#### Android Development
- **Android Studio** Hedgehog (2023.1.1) or newer ([Download](https://developer.android.com/studio))
- **Android SDK** API Level 26 or higher
- **Kotlin** 1.9 or higher (comes with Android Studio)
- **JDK** 17 or higher
- **Gradle** 8.0+ (comes with Android Studio)

#### iOS Development (macOS only)
- **macOS** Ventura (13.0) or newer
- **Xcode** 15.0 or newer ([Download from App Store](https://apps.apple.com/us/app/xcode/id497799835))
- **Swift** 5.9 or higher (comes with Xcode)
- **CocoaPods** or **Swift Package Manager**
- Apple Developer account (for device testing)

### Setup

#### Initial Setup

```bash
# Clone the repository
git clone https://github.com/Treystu/SC.git
cd SC

# Install dependencies for all workspaces
npm install

# Build core library (required for all platforms)
cd core
npm run build
npm test  # Verify setup is working

# Return to root
cd ..
```

#### Web Platform Setup

```bash
# Install web dependencies
cd web
npm install

# Start development server
npm run dev
# Opens at http://localhost:3000

# Build for production
npm run build
npm run preview  # Preview production build
```

**Troubleshooting Web:**
- **Port 3000 in use**: Change port in `web/vite.config.ts`
- **Cannot find @sc/core**: Build core library first (`cd core && npm run build`)
- **Hot reload not working**: Restart dev server (Ctrl+C, then `npm run dev`)

#### Android Platform Setup

```bash
# Open project in Android Studio
# File → Open → Select android/ directory

# Or build from command line:
cd android
./gradlew assembleDebug    # Build debug APK
./gradlew installDebug     # Install on connected device/emulator

# Run tests
./gradlew test
./gradlew connectedAndroidTest  # Requires device/emulator
```

**Troubleshooting Android:**
- **Gradle sync failed**: Check JDK version is 17+
- **Cannot resolve @sc/core**: Ensure core library is built
- **SDK not found**: Set `ANDROID_HOME` environment variable
- **Emulator won't start**: Check virtualization enabled in BIOS
- **Build fails with memory error**: Increase Gradle heap size in `gradle.properties`

For detailed Android setup, see [android/README.md](android/README.md).

#### iOS Platform Setup (macOS only)

```bash
# Open project in Xcode
open ios/SC.xcodeproj

# Or build from command line:
cd ios
xcodebuild -scheme SovereignCommunications -sdk iphonesimulator build

# Run tests
xcodebuild -scheme SovereignCommunications -sdk iphonesimulator test
```

**Troubleshooting iOS:**
- **Code signing errors**: Configure your Apple Developer account in Xcode
- **Build failed**: Ensure Xcode command line tools installed: `xcode-select --install`
- **Simulator not found**: Open Xcode → Window → Devices and Simulators
- **Cannot resolve @sc/core**: Ensure core library is built

For detailed setup guides, see:
- [docs/SETUP.md](docs/SETUP.md) - General setup guide
- [docs/DEVELOPER_SETUP.md](docs/DEVELOPER_SETUP.md) - Platform-specific setup
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - Common issues and solutions

## Development Workflow

### 1. Create a Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Changes
- Write code following the style guide
- Add/update tests
- Update documentation
- Run tests: `npm test`
- Run linter: `npm run lint`

### 3. Verify Locally
Before pushing, run the local CI checks:
```bash
npm run ci:local
# or individually:
npm run lint:all      # Lint all platforms
npm run build:all     # Build all platforms
npm test              # Run all tests
```

See [CI/CD Quick Reference](docs/CI_CD_QUICK_REFERENCE.md) for more options.

### 4. Commit Changes
Use descriptive commit messages:
```bash
git add .
git commit -m "Add health score calculation to peer monitoring

- Implement health score based on latency, packet loss, and missed heartbeats
- Add tests for health score edge cases
- Update documentation"
```

### 5. Push and Create PR
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## CI/CD Pipeline

All pull requests automatically run through our CI/CD pipeline which:
- ✅ Lints TypeScript, Kotlin, and Swift code
- ✅ Builds web, Android, and iOS applications
- ✅ Runs unit tests on Node 18, 20, and 22
- ✅ Runs integration tests
- ✅ Runs E2E tests across browsers
- ✅ Performs security audits

**All checks must pass before merging.**

For detailed CI/CD information, see:
- [CI/CD Documentation](docs/ci-cd.md)
- [CI/CD Quick Reference](docs/CI_CD_QUICK_REFERENCE.md)

## Code Style Guide

### TypeScript
```typescript
// ✅ Good
export function calculateHealthScore(peer: PeerHealth): number {
  let score = 100;
  
  // Penalty for high latency
  if (peer.rtt > 1000) score -= 30;
  else if (peer.rtt > 500) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}

// ❌ Bad
export function calcScore(p:any){
  var s=100;
  if(p.rtt>1000)s-=30;
  return s;
}
```

### Testing
```typescript
// ✅ Good
describe('PeerHealthMonitor', () => {
  let monitor: PeerHealthMonitor;
  
  beforeEach(() => {
    monitor = new PeerHealthMonitor(/* ... */);
  });
  
  afterEach(() => {
    monitor.shutdown();
  });
  
  it('should calculate health score based on latency', () => {
    const health = { rtt: 1500, packetLoss: 0, missedHeartbeats: 0 };
    const score = calculateHealthScore(health);
    expect(score).toBeLessThan(80);
  });
});

// ❌ Bad
it('test1', () => {
  const x = new Thing();
  expect(x.doStuff()).toBe(true);
});
```

### Documentation
```typescript
/**
 * Calculate health score for a peer based on multiple metrics
 * 
 * @param peer - Peer health data including RTT, packet loss, and missed heartbeats
 * @returns Health score from 0 (unhealthy) to 100 (excellent)
 * 
 * @example
 * ```typescript
 * const health = { rtt: 50, packetLoss: 0.01, missedHeartbeats: 0 };
 * const score = calculateHealthScore(health); // Returns ~90
 * ```
 */
export function calculateHealthScore(peer: PeerHealth): number {
  // Implementation
}
```

## Testing Requirements

### Unit Tests
- Write tests for all new functions
- Test edge cases and error conditions
- Use descriptive test names
- Mock external dependencies

### Coverage
- Aim for >80% code coverage
- Critical paths should have 100% coverage
- Include negative test cases

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- routing.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

## Commit Message Guidelines

Format:
```
<type>: <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

Examples:
```
feat: Add adaptive heartbeat intervals to health monitor

- Implement dynamic interval adjustment based on health score
- Good connections use longer intervals (up to 60s)
- Poor connections use shorter intervals (down to 10s)
- Add tests for interval adaptation

Closes #123
```

```
fix: Prevent memory leak in message reassembly

- Add cleanup of old incomplete messages
- Implement memory usage limits
- Add tests for cleanup functionality

Fixes #456
```

## Pull Request Process

### Before Submitting

**Required Checks:**
- [ ] All tests pass (`npm test`)
- [ ] All linters pass (`npm run lint:all`)
- [ ] Code follows style guide
- [ ] New features have tests (see coverage requirements below)
- [ ] Documentation is updated
- [ ] Commits are well-formatted
- [ ] Branch is up to date with main
- [ ] Local CI checks pass (`npm run ci:local`)
- [ ] Security review completed for crypto/privacy changes

**Test Coverage Requirements:**
- [ ] **Overall coverage**: >80% for all new code
- [ ] **Critical paths**: 100% coverage for cryptography, authentication, and security-sensitive code
- [ ] **Unit tests**: All new functions have corresponding unit tests
- [ ] **Integration tests**: API contracts verified in `tests/integration/`
- [ ] **E2E tests**: User-facing features have E2E tests (if applicable)

**E2E Test Requirements:**

When your PR adds or modifies user-facing features, you must add E2E tests:

```bash
# Run E2E tests locally before submitting
npm run test:e2e

# For cross-platform changes, test on all platforms
npm run test:e2e:cross-platform  # Web-to-Web
npm run test:e2e:android         # Web-to-Android (requires emulator)
npm run test:e2e:ios            # Web-to-iOS (macOS only)
```

Location for E2E tests: `tests/e2e/`

See [docs/E2E_TESTING.md](docs/E2E_TESTING.md) for detailed E2E testing guide.

**CI Pipeline Requirements:**

All checks must pass before merge:
- ✅ **Linting**: TypeScript/JavaScript, Kotlin, Swift
- ✅ **Building**: Web, Android, iOS applications
- ✅ **Unit Tests**: Core library (Node 18, 20, 22)
- ✅ **Integration Tests**: Cross-platform functionality
- ✅ **E2E Tests**: Playwright across browsers
- ✅ **Security Audit**: Dependency vulnerabilities, CodeQL scan
- ✅ **Visual Regression**: UI screenshots match baseline (for UI changes)

You can view CI results at: https://github.com/Treystu/SC/actions

**Documentation Requirements:**

Update relevant documentation:
- [ ] **README.md**: For user-facing changes
- [ ] **ARCHITECTURE.md**: For architectural changes (in `docs/`)
- [ ] **API.md**: For API changes (in `docs/`)
- [ ] **SECURITY.md**: For security-related changes (in `docs/`)
- [ ] **Code comments**: JSDoc for public APIs, inline comments for complex logic
- [ ] **PROGRESS.md**: Mark completed tasks

**Note**: The automated CI/CD pipeline will verify all these checks when you create your PR. See [docs/CI_CD_QUICK_REFERENCE.md](docs/CI_CD_QUICK_REFERENCE.md) for local CI commands.

### PR Description
Include:
1. **What** - What changes were made
2. **Why** - Why these changes were necessary
3. **How** - How the changes work
4. **Testing** - How the changes were tested
5. **Screenshots** - For UI changes

Example:
```markdown
## What
Implements adaptive heartbeat intervals for peer health monitoring.

## Why
Fixed heartbeat intervals waste bandwidth on stable connections and 
don't respond quickly enough to degrading connections.

## How
- Health score determines heartbeat interval
- Good health (>80): longer intervals (up to 60s)
- Poor health (<50): shorter intervals (down to 10s)
- Smooth adjustment prevents oscillation

## Testing
- Added 12 unit tests for health monitoring
- Tested with simulated network conditions
- Verified memory usage stays within limits

## Related Issues
Closes #123
```

### Review Process
1. Automated CI/CD checks must pass (tests, linting, building)
2. Code review by maintainer (see review guidelines below)
3. Address review comments
4. Security review for crypto/privacy changes
5. Final approval and merge

The CI/CD pipeline automatically:
- Runs on all platforms (Web, Android, iOS)
- Tests across multiple Node versions (18, 20, 22)
- Builds production artifacts
- Performs security audits (dependency scan, CodeQL)
- Runs visual regression tests (for UI changes)

You can view the workflow runs at: https://github.com/Treystu/SC/actions

For detailed CI/CD information, see:
- [docs/CI-CD.md](docs/CI-CD.md) - Complete CI/CD documentation
- [docs/CI_CD_QUICK_REFERENCE.md](docs/CI_CD_QUICK_REFERENCE.md) - Quick command reference

### Code Review Guidelines for Reviewers

When reviewing PRs, pay special attention to:

**General Code Review:**
- [ ] Code follows project style guide
- [ ] Changes are minimal and focused
- [ ] No unnecessary code deletion or modification
- [ ] Tests cover edge cases and error conditions
- [ ] Documentation is clear and accurate
- [ ] No debugging code, console.logs, or commented-out code

**Security and Privacy Review:**

For changes involving cryptography, authentication, or privacy-sensitive code:

- [ ] **Cryptography**:
  - Uses only audited libraries (`@noble/curves`, `@noble/ciphers`)
  - No custom crypto implementations
  - Proper key sizes (Ed25519: 32 bytes, X25519: 32 bytes)
  - Nonces are unique and randomly generated
  - Constant-time comparisons for secrets
- [ ] **Input Validation**:
  - All external inputs validated
  - Buffer sizes checked before access
  - Type guards for TypeScript/JavaScript
  - Null/undefined checks
  - Integer overflow prevention
- [ ] **Secret Management**:
  - No hardcoded secrets or keys
  - Secrets not logged or printed
  - Secure memory wiping after use
  - Keys stored in platform-specific secure storage
- [ ] **Authentication**:
  - Signatures verified before processing messages
  - Replay attack prevention (nonces, timestamps)
  - Identity verification required
- [ ] **Privacy**:
  - No unnecessary data collection
  - No telemetry or analytics without consent
  - No PII in logs or error messages
  - Data minimization principle followed

See [docs/PLATFORM_SECURITY_BEST_PRACTICES.md](docs/PLATFORM_SECURITY_BEST_PRACTICES.md) for detailed security guidelines.

## Security Guidelines

### Cryptography
- **Never** implement custom crypto primitives
- Use only audited libraries (@noble/* packages)
- Validate all cryptographic inputs
- Use constant-time operations for secret comparisons
- Document security assumptions

### Input Validation
```typescript
// ✅ Good
function decodeMessage(buffer: Uint8Array): Message {
  if (buffer.length < HEADER_SIZE) {
    throw new MessageValidationError(
      `Buffer too small: ${buffer.length} bytes. Minimum: ${HEADER_SIZE} bytes`
    );
  }
  
  const header = decodeHeader(buffer.slice(0, HEADER_SIZE));
  validateHeader(header);
  
  return { header, payload: buffer.slice(HEADER_SIZE) };
}

// ❌ Bad
function decode(buf: any) {
  return { header: buf.slice(0, 109), payload: buf.slice(109) };
}
```

### Reporting Security Issues
Do NOT create public GitHub issues for security vulnerabilities. Instead:
1. Email security concerns privately
2. Include detailed description
3. Provide steps to reproduce
4. Allow time for fix before disclosure

## Documentation

### Code Comments
- Explain **why**, not **what**
- Use JSDoc for public APIs
- Keep comments up to date
- Remove commented-out code

### Documentation Files
- Update README.md for user-facing changes
- Update docs/ for architecture changes
- Update PROGRESS.md when completing tasks
- Add examples for new features

## Performance Considerations

### Memory
- Avoid memory leaks (cleanup listeners, intervals)
- Use appropriate data structures (Map, Set, WeakMap)
- Implement size limits for caches
- Monitor memory usage in tests

### Speed
- Profile before optimizing
- Use efficient algorithms (O(1) lookups)
- Batch operations when possible
- Avoid unnecessary allocations

### Network
- Minimize message size
- Implement rate limiting
- Use appropriate timeouts
- Handle backpressure

## Questions?

### Resources for New Contributors

**Getting Started:**
- [README.md](README.md) - Project overview and quick start
- [docs/SETUP.md](docs/SETUP.md) - Development environment setup
- [docs/DEVELOPER_SETUP.md](docs/DEVELOPER_SETUP.md) - Platform-specific setup guides

**Architecture & Design:**
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture and component design
- [docs/protocol.md](docs/protocol.md) - Binary message protocol specification
- [docs/API.md](docs/API.md) - Core library API documentation

**Security & Privacy:**
- [SECURITY.md](SECURITY.md) - Security policy and vulnerability reporting
- [docs/SECURITY.md](docs/SECURITY.md) - Security model and threat analysis
- [docs/PLATFORM_SECURITY_BEST_PRACTICES.md](docs/PLATFORM_SECURITY_BEST_PRACTICES.md) - Platform-specific security guidelines
- [docs/THREAT_MODEL_V1.md](docs/THREAT_MODEL_V1.md) - V1 threat model

**Testing:**
- [docs/TESTING.md](docs/TESTING.md) - Testing infrastructure and strategy
- [docs/E2E_TESTING.md](docs/E2E_TESTING.md) - End-to-end testing guide
- [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) - Comprehensive testing strategy

**Development Tools:**
- [docs/CI_CD_QUICK_REFERENCE.md](docs/CI_CD_QUICK_REFERENCE.md) - CI/CD commands quick reference
- [docs/CI-CD.md](docs/CI-CD.md) - Complete CI/CD documentation
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - Common issues and solutions

**Platform-Specific:**
- [android/README.md](android/README.md) - Android app documentation
- [android/BEST_PRACTICES.md](android/BEST_PRACTICES.md) - Android development best practices
- [web/DEPLOYMENT.md](web/DEPLOYMENT.md) - Web app deployment guide

### Tips for New Contributors

1. **Start Small**: Begin with documentation improvements or small bug fixes to familiarize yourself with the codebase
2. **Read the Docs**: Review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) to understand the system design
3. **Run Tests First**: Before making changes, run `npm test` to ensure your environment is set up correctly
4. **Ask Questions**: Use GitHub Discussions for questions, or open an issue with the `question` label
5. **Follow the Style**: Run linters before committing (`npm run lint:all`)
6. **Test Locally**: Always run `npm run ci:local` before pushing
7. **Keep PRs Focused**: One feature or fix per PR makes review easier
8. **Update Tests**: Add tests for new features, update tests for bug fixes
9. **Check Coverage**: Run `npm test -- --coverage` to ensure >80% coverage

### Getting Help

- **Documentation**: Check the `docs/` folder first
- **Troubleshooting**: See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **Issues**: Search [existing issues](https://github.com/Treystu/SC/issues) or open a new one
- **Discussions**: Use [GitHub Discussions](https://github.com/Treystu/SC/discussions) for questions
- **Security**: Email security concerns privately (see [SECURITY.md](SECURITY.md)) - do NOT open public issues

### Common Tasks Reference

**Testing @sc/core changes:**
```bash
cd core && npm run build && npm test
cd ../web && npm run dev      # Test on web
cd ../android && ./gradlew assembleDebug  # Test on Android
```

**Running E2E tests:**
```bash
npm run test:e2e              # All E2E tests
npm run test:e2e:ui           # Interactive mode
```

**Building for production:**
```bash
npm run build:all             # Build all platforms
```

**Checking code quality:**
```bash
npm run lint:all              # Lint all platforms
npm run test:coverage         # Check test coverage
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
