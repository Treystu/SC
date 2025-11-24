# Security Guide

## Cryptographic Implementation

### End-to-End Encryption
- **Algorithm**: ChaCha20-Poly1305 for message encryption
- **Key Exchange**: ECDH with Curve25519
- **Signing**: Ed25519 for message authentication
- **Forward Secrecy**: Session keys rotated per conversation

### Key Management
- **Storage**: Platform-specific secure storage (Keychain/KeyStore/IndexedDB)
- **Generation**: Cryptographically secure random number generation
- **Rotation**: Automatic session key rotation every 1000 messages or 24 hours

## Security Best Practices

### For Users
1. Always verify peer identities using QR codes or audio tone pairing
2. Enable automatic key rotation in settings
3. Regularly backup your identity keys securely
4. Keep your device software updated
5. Use strong device passwords/biometrics

### For Developers
1. Never log cryptographic keys or sensitive data
2. Always validate message signatures before processing
3. Implement proper TTL and deduplication to prevent replay attacks
4. Use constant-time comparisons for cryptographic operations
5. Sanitize all user inputs to prevent injection attacks

## Threat Model

### Protected Against
- Network eavesdropping (end-to-end encryption)
- Man-in-the-middle attacks (Ed25519 signatures)
- Replay attacks (nonce-based authentication)
- Message tampering (Poly1305 MAC)

### Not Protected Against
- Compromised devices (physical access)
- Social engineering attacks
- Metadata analysis (message timing/size)
- Advanced persistent threats with device access

## Security Audit Checklist

- [ ] All cryptographic implementations use well-tested libraries
- [ ] No hardcoded secrets in source code
- [ ] Secure random number generation for all keys
- [ ] Proper key derivation for session keys
- [ ] Constant-time comparisons for authentication
- [ ] Input validation on all external data
- [ ] Secure deletion of sensitive data from memory
- [ ] Rate limiting on API endpoints
- [ ] Protection against timing attacks
- [ ] Regular security updates for dependencies

## Reporting Security Issues

If you discover a security vulnerability, please email security@sovereign-communications.example (or report through appropriate channels). Do not create public GitHub issues for security problems.
