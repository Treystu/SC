# Security Policy

## Supported Versions

We release security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

We take security seriously. If you discover a security vulnerability, please report it privately through one of the following methods:

### Preferred: GitHub Security Advisories

1. Go to the [Security tab](https://github.com/Treystu/SC/security/advisories) of this repository
2. Click "Report a vulnerability"
3. Fill out the form with details about the vulnerability

### Alternative: Email

Send an email to: **security@sovereigncommunications.app**

Please encrypt sensitive information using our PGP key:
```
-----BEGIN PGP PUBLIC KEY BLOCK-----
[PGP key will be published here]
-----END PGP PUBLIC KEY BLOCK-----
```

### What to Include

Please include the following information in your report:

- **Type of vulnerability** (e.g., buffer overflow, SQL injection, cross-site scripting)
- **Full paths of source file(s)** related to the vulnerability
- **Location of the affected source code** (tag/branch/commit or direct URL)
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the vulnerability**, including how an attacker might exploit it
- **Suggested fix** (if you have one)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Vulnerability Assessment**: Within 7 days
- **Security Patch**: Within 30 days for critical issues
- **Public Disclosure**: Coordinated with reporter after patch release

## Community Security Program

### Scope

**In Scope:**
- Web application (sovereigncommunications.app)
- Android application (com.sovereign.communications)
- iOS application (Sovereign Communications)
- Core protocol implementation
- Mesh networking protocol
- Cryptographic implementations
- P2P communication layer

**Out of Scope:**
- Social engineering attacks
- Physical attacks
- Denial of Service (DoS/DDoS)
- Issues in third-party libraries (report to the library maintainer)
- Issues requiring physical access to a device
- Attacks requiring MITM or physical access to network
- Issues in deprecated or unsupported versions

### Eligibility and Recognition

Sovereign Communications is a community-driven open-source project. We don't offer financial rewards, but we deeply value security researchers who help keep the platform secure.

**To be eligible for recognition:**

1. **First Reporter**: You must be the first to report the vulnerability
2. **Responsible Disclosure**: Follow our disclosure timeline
3. **No Public Disclosure**: Do not disclose publicly until we release a patch
4. **No Data Exfiltration**: Do not access or modify user data
5. **Good Faith**: Act in good faith to avoid privacy violations

### Severity Ratings

We use the [CVSS 3.1](https://www.first.org/cvss/calculator/3.1) calculator to determine severity:

#### Critical (CVSS 9.0-10.0)
**Recognition: Prominent acknowledgment in security hall of fame**
- Remote code execution
- Complete account takeover
- Mass data breach
- Breaking end-to-end encryption

#### High (CVSS 7.0-8.9)
**Recognition: Acknowledgment in security hall of fame**
- Authentication bypass
- Privilege escalation
- Significant data exposure
- Cryptographic weakness

#### Medium (CVSS 4.0-6.9)
**Recognition: Acknowledgment in release notes**
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Information disclosure
- Insecure direct object references

#### Low (CVSS 0.1-3.9)
**Recognition: Acknowledgment in changelog**
- Minor information disclosure
- Best practice violations
- Edge case vulnerabilities

### Recognition

As a community-focused project, we recognize security researchers through:


- **[Security Researchers Hall of Fame](docs/SECURITY_HALL_OF_FAME.md)** - Permanent recognition
- **Release Notes** - Acknowledgment in version release notes
- **Security Advisories** - Credit in public security advisories
- **Project README** - Contributor recognition
- **Community Updates** - Highlighted in newsletters/blog posts

**The satisfaction of:**
- Protecting thousands of users worldwide
- Contributing to open-source privacy and security
- Making decentralized communication more secure
- Being part of a community defending digital freedom

## Safe Harbor

We support safe harbor for security researchers who:

- Make a good faith effort to avoid privacy violations, data destruction, and interruption or degradation of our services
- Only interact with accounts you own or with explicit permission of the account holder
- Do not exploit a vulnerability beyond what is necessary to demonstrate it
- Report vulnerabilities promptly
- Keep vulnerability details confidential until we've had a reasonable time to respond

We will not pursue legal action against researchers who follow these guidelines.

## Security Best Practices

### For Users

1. **Keep Software Updated**: Install updates promptly when available
2. **Verify Downloads**: Check signatures and hashes before installing
3. **Strong Passphrases**: Use strong, unique passphrases for encryption
4. **Backup Keys**: Keep secure backups of your cryptographic keys
5. **Device Security**: Enable device encryption and screen lock
6. **Network Security**: Use trusted networks when possible

### For Developers

1. **Security Training**: Complete required security training
2. **Code Review**: All code must be reviewed before merging
3. **Dependency Updates**: Keep dependencies updated
4. **Secrets Management**: Never commit secrets to git
5. **Security Testing**: Run security tests before release
6. **Incident Response**: Know the incident response procedures

## Security Features

Sovereign Communications implements multiple security layers:

### Cryptography
- **Encryption**: XChaCha20-Poly1305 (authenticated encryption)
- **Key Exchange**: X25519 (Elliptic Curve Diffie-Hellman)
- **Signatures**: Ed25519 (Edwards-curve Digital Signature Algorithm)
- **Random Numbers**: Cryptographically secure random number generators
- **Perfect Forward Secrecy**: Double Ratchet algorithm (Signal Protocol)

### Platform Security
- **Android**: Hardware-backed Keystore (StrongBox), SQLCipher database encryption
- **iOS**: Keychain for secure storage, AES-256 encryption
- **Web**: Content Security Policy, Subresource Integrity

### Network Security
- **Certificate Pinning**: Prevents MITM attacks
- **End-to-End Encryption**: Messages encrypted on sender's device
- **Mesh Routing**: Decentralized, no central server
- **Proof-of-Work**: Spam prevention mechanism

### Privacy Protection
- **Traffic Padding**: Prevents message size analysis
- **Secure Deletion**: Multi-pass file overwriting
- **Memory Wiping**: Sensitive data cleared from memory
- **No Metadata Logging**: Minimal metadata collection

## Known Limitations

We document known security limitations transparently:

1. **SSD Wear Leveling**: Secure deletion may not work perfectly on SSDs
2. **Garbage Collection**: Sensitive data in memory may be copied by GC
3. **WebRTC Libraries**: Android version needs updating (documented in SECURITY_TODO.md)
4. **External Audit Pending**: Full security audit scheduled before V1.0

See [SECURITY_TODO.md](docs/SECURITY_TODO.md) for complete list of ongoing security work.

## Compliance

### Cryptography Export

This software contains cryptographic features. Please check your local laws regarding cryptography export and use:

- **U.S.**: Export controlled under EAR (BIS)
- **EU**: Dual-use goods regulations
- **Other jurisdictions**: Check local regulations

### Data Protection

- **GDPR**: Users control their data, right to deletion
- **CCPA**: Privacy controls for California residents
- **Other**: Compliant with major privacy regulations

## Security Audit History

| Date | Auditor | Scope | Report |
|------|---------|-------|--------|
| 2025-11 | Internal | Comprehensive security review | [docs/SECURITY_REVIEW_V1_BETA.md](docs/SECURITY_REVIEW_V1_BETA.md) |
| TBD | External | Full security audit | Scheduled before V1.0 |

## Contact

- **Security Team**: security@sovereigncommunications.app
- **General Support**: support@sovereigncommunications.app
- **PGP Key**: [To be published]

## Updates

This security policy is reviewed quarterly and updated as needed. Last update: 2025-11-18

## Acknowledgments

We thank the security research community for helping keep Sovereign Communications secure. Special thanks to all researchers who have responsibly disclosed vulnerabilities.

---

**Remember**: Security is a shared responsibility. If you see something, say something.
