# Security Model - Sovereign Communications

## Executive Summary

Sovereign Communications (SC) is designed to provide secure, decentralized communication with strong cryptographic guarantees. This document outlines the security model, threat analysis, and cryptographic design decisions.

## Cryptographic Foundation

### Algorithms

All cryptographic algorithms are industry-standard, well-audited, and recommended by modern security experts:

1. **Ed25519** (Signature)
   - Elliptic curve digital signature algorithm
   - 128-bit security level
   - Small signatures (64 bytes)
   - Fast verification
   - Reference: RFC 8032

2. **X25519** (Key Exchange)
   - Elliptic curve Diffie-Hellman
   - 128-bit security level
   - Used for establishing shared secrets
   - Reference: RFC 7748

3. **XChaCha20-Poly1305** (Encryption)
   - Authenticated encryption with associated data (AEAD)
   - 256-bit keys
   - 192-bit nonces (extended from ChaCha20)
   - 128-bit authentication tags
   - Reference: draft-irtf-cfrg-xchacha

4. **SHA-256** (Hashing)
   - 256-bit output
   - Used for fingerprints and message hashes
   - Reference: FIPS 180-4

### Implementation

We use the **@noble** family of cryptographic libraries:
- **@noble/curves**: Ed25519, X25519 implementation
- **@noble/ciphers**: XChaCha20-Poly1305 implementation
- **@noble/hashes**: SHA-256 and other hash functions

**Why @noble?**
- Audited by independent security researchers
- Minimal dependencies (reduces attack surface)
- Pure JavaScript/TypeScript (no native bindings)
- Well-maintained and actively developed
- Used in production by major cryptocurrency wallets

## Identity and Authentication

### Identity Model

Each user is identified by their Ed25519 public key (32 bytes):
- **Public Key**: Shared openly, used as identifier
- **Private Key**: Never shared, stored securely on device

**Key Fingerprint:**
```
SHA-256(public_key) → formatted as hex groups
Example: 1a2b 3c4d 5e6f 7a8b 9c0d 1e2f 3a4b 5c6d
```

Users verify identities by comparing fingerprints out-of-band (QR code, in person, phone call).

### Authentication

Every message is signed with Ed25519:
```
signature = Ed25519.sign(version || type || ttl || timestamp || payload, private_key)
```

Recipients verify:
```
valid = Ed25519.verify(signature, message, sender_public_key)
```

**Protection Against:**
- ✅ Message tampering (signature would be invalid)
- ✅ Impersonation (attacker doesn't have private key)
- ✅ Forgery (computationally infeasible to forge signature)

## Encryption and Confidentiality

### Key Establishment

For each peer relationship, establish a shared secret using ECDH:

```
Alice: a (private), A (public)
Bob:   b (private), B (public)

Alice computes: shared_secret = ECDH(a, B)
Bob computes:   shared_secret = ECDH(b, A)

Both arrive at the same shared_secret
```

### Session Keys

Session keys are derived from the shared secret:
```
session_key = HKDF-SHA256(shared_secret, salt, info)
```

**Session Key Properties:**
- 32 bytes (256 bits)
- Rotated every 1000 messages or 24 hours
- Unique per peer pair
- Forward secure (old keys deleted after rotation)

### Message Encryption

Each message payload is encrypted:
```
nonce = random(24)  # 192 bits
ciphertext = XChaCha20-Poly1305.encrypt(plaintext, session_key, nonce)
# ciphertext includes 16-byte authentication tag
```

**Protection Against:**
- ✅ Eavesdropping (plaintext is encrypted)
- ✅ Tampering (Poly1305 MAC detects modifications)
- ✅ Chosen ciphertext attacks (AEAD property)

## Perfect Forward Secrecy

### Session Key Rotation

Session keys are rotated to limit exposure:

**Rotation Triggers:**
1. After 1000 messages
2. After 24 hours
3. On explicit user request

**Rotation Process:**
```
new_key_material = SHA256(current_session_key || current_nonce)
new_session_key = new_key_material
old_session_key = SECURELY_DELETE()
```

**Benefits:**
- Compromise of current key doesn't expose past messages
- Compromise of current key doesn't expose future messages
- Regular rotation limits damage from undetected compromise

### Key Deletion

After rotation:
1. Overwrite old key in memory
2. Delete from secure storage
3. Only keep current session key

## Threat Analysis

### Threats We Protect Against

#### 1. Passive Eavesdropping
- **Threat**: Adversary intercepts network traffic
- **Protection**: End-to-end encryption with XChaCha20-Poly1305
- **Strength**: 256-bit key, computationally infeasible to break

#### 2. Active Tampering
- **Threat**: Adversary modifies messages in transit
- **Protection**: Ed25519 signatures + Poly1305 MAC
- **Strength**: Any modification invalidates signature/MAC

#### 3. Impersonation
- **Threat**: Adversary pretends to be legitimate user
- **Protection**: Public key authentication
- **Strength**: Requires private key (computationally infeasible to derive)

#### 4. Replay Attacks
- **Threat**: Adversary resends old valid messages
- **Protection**: Timestamps + message deduplication cache
- **Strength**: Messages older than 60 seconds rejected

#### 5. Man-in-the-Middle (MITM)
- **Threat**: Adversary intercepts key exchange
- **Protection**: Out-of-band key verification (fingerprints)
- **Strength**: Depends on user verification diligence

### Threats We DON'T Protect Against

#### 1. Traffic Analysis
- **Exposure**: Message sizes, timing, sender/recipient IDs
- **Mitigation**: None currently (future: padding, mixing)
- **Impact**: Adversary can see who talks to whom and when

#### 2. Device Compromise
- **Exposure**: Private keys, message history, contacts
- **Mitigation**: Device encryption, secure boot (platform-dependent)
- **Impact**: Complete compromise of user's account

#### 3. Denial of Service (DoS)
- **Exposure**: Resource exhaustion, network flooding
- **Mitigation**: Rate limiting, proof-of-work (optional)
- **Impact**: Service disruption, battery drain

#### 4. Sybil Attacks
- **Exposure**: Attacker creates many fake identities
- **Mitigation**: None currently (future: web of trust)
- **Impact**: Mesh pollution, routing manipulation

#### 5. Correlation Attacks
- **Exposure**: Linking multiple sessions of same user
- **Mitigation**: None currently (identity is persistent)
- **Impact**: Long-term tracking across sessions

## Key Management

### Key Storage

**Web (IndexedDB):**
```javascript
// Encrypted with password-derived key
store.put({
  id: 'identity',
  publicKey: pubkey,
  privateKey: encrypt(privkey, password_key)
})
```

**Android (KeyStore):**
- Hardware-backed if available
- Biometric protection optional
- Encrypted at rest

**iOS (Keychain):**
- Secure Enclave if available
- Biometric protection optional
- Encrypted at rest

### Key Backup

**Encrypted Export:**
```
backup = {
  version: 1,
  publicKey: hex(pubkey),
  encryptedPrivateKey: XChaCha20-Poly1305.encrypt(
    privkey,
    PBKDF2(password, salt, 100000),
    nonce
  ),
  salt: hex(salt),
  nonce: hex(nonce)
}
```

**Recovery:**
1. User enters backup password
2. Derive key using PBKDF2
3. Decrypt private key
4. Verify by deriving public key

## Security Best Practices

### For Users

1. **Verify Fingerprints**: Always verify peer fingerprints out-of-band
2. **Strong Passwords**: Use strong password for key backup
3. **Device Security**: Keep device locked with PIN/biometric
4. **Updates**: Keep app updated for security patches
5. **Backup**: Securely store key backup (offline, encrypted)

### For Developers

1. **Use Audited Libraries**: Stick to @noble libraries
2. **Constant-Time Operations**: Avoid timing attacks
3. **Secure Random**: Use crypto.getRandomValues() or equivalent
4. **Memory Management**: Overwrite sensitive data after use
5. **Input Validation**: Validate all inputs before processing

## Security Audit Status

**Current Status**: Not audited (pre-alpha)

**Planned Audits:**
1. Cryptographic implementation review
2. Protocol security analysis
3. Source code security audit
4. Penetration testing

## Incident Response

In case of discovered vulnerability:

1. **Disclosure**: Responsible disclosure via security@example.com
2. **Assessment**: Evaluate severity and impact
3. **Patch**: Develop and test fix
4. **Release**: Emergency update if critical
5. **Notification**: Inform users of severity and recommended action

## Compliance

**Encryption Export:** 
- Strong encryption may be export-controlled in some jurisdictions
- Users responsible for compliance with local laws

**Data Privacy:**
- No user data collected by default (decentralized design)
- Users control their own data
- GDPR-compliant (data portability, right to deletion)

## Cryptographic Agility

Future-proofing for algorithm upgrades:

**Version Field**: Protocol includes version in every message
**Algorithm Negotiation**: Can add new cipher suites in future versions
**Migration Path**: Old keys can co-exist during transition

**Potential Upgrades:**
- Post-quantum key exchange (Kyber, X3DH)
- Post-quantum signatures (Dilithium, SPHINCS+)
- Improved privacy (Tor integration, mixnets)

## References

1. RFC 8032 - Edwards-Curve Digital Signature Algorithm (EdDSA)
2. RFC 7748 - Elliptic Curves for Security
3. RFC 5869 - HMAC-based Extract-and-Expand Key Derivation Function (HKDF)
4. draft-irtf-cfrg-xchacha - XChaCha: eXtended-nonce ChaCha and AEAD
5. Signal Protocol - Double Ratchet Algorithm
6. WhatsApp Security Whitepaper
7. @noble/curves audit reports

## Changelog

### 0.1.0 (2024-11-09)
- Initial security model document
- Cryptographic algorithms defined
- Threat analysis completed
- Key management procedures outlined
