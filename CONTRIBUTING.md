# Contributing to Sovereign Communications

Thank you for considering contributing to Sovereign Communications! This document provides guidelines and best practices for contributing to this project.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions. We're building software together to empower secure, decentralized communication.

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Git
- TypeScript knowledge
- Understanding of cryptography basics (recommended)

### Setup
```bash
# Clone the repository
git clone https://github.com/Treystu/SC.git
cd SC

# Install dependencies
npm install

# Build core library
cd core
npm run build
npm test

# Run web app
cd ../web
npm run dev
```

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
- [ ] All tests pass (`npm test`)
- [ ] All linters pass (`npm run lint:all`)
- [ ] Code follows style guide
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] Commits are well-formatted
- [ ] Branch is up to date with main
- [ ] Local CI checks pass (`npm run ci:local`)

**Note**: The automated CI/CD pipeline will verify all these checks when you create your PR.

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
2. Code review by maintainer
3. Address review comments
4. Approval and merge

The CI/CD pipeline automatically:
- Runs on all platforms (Web, Android, iOS)
- Tests across multiple Node versions (18, 20, 22)
- Builds production artifacts
- Performs security audits

You can view the workflow runs at: https://github.com/Treystu/SC/actions

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

- Check existing documentation
- Search closed issues
- Ask in GitHub Discussions
- Create an issue with `question` label

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
