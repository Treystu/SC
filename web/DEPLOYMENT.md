# Sovereign Communications - V1 Deployment Guide

## 🚀 Quick Start

Sovereign Communications is now V1 production-ready for web deployment!

### Prerequisites
- Node.js 18+
- npm or yarn

### Local Development
```bash
# Install dependencies
npm install --workspaces

# Build core library
cd core && npm run build && cd ..

# Start web dev server
cd web && npm run dev
```

### Production Build
```bash
# Build for production
cd web && npm run build

# Output will be in web/dist/
```

## 📦 Deployment Options

### Option 1: Netlify (Recommended)

1. **Connect to Netlify:**
   ```bash
   # Install Netlify CLI
   npm install -g netlify-cli

   # Login
   netlify login

   # Deploy from web directory
   cd web
   netlify deploy --prod
   ```

2. **Or use GitHub integration:**
   - Connect your GitHub repo to Netlify
   - Set build directory: `web`
   - Build command: `npm run build`
   - Publish directory: `dist`
   - The `netlify.toml` is already configured!

### Option 2: Vercel

1. **Deploy via CLI:**
   ```bash
   # Install Vercel CLI
   npm install -g vercel

   # Deploy from web directory
   cd web
   vercel --prod
   ```

2. **Or use GitHub integration:**
   - Import project from GitHub
   - Root directory: `web`
   - Build command: `npm run build`
   - Output directory: `dist`
   - The `vercel.json` is already configured!

### Option 3: Self-Hosted

```bash
# Build
cd web && npm run build

# Serve with any static file server
npx serve -s dist -p 3000

# Or use nginx, Apache, etc.
```

## ✅ V1 Features Included

### Core Functionality
- ✅ End-to-end encryption (Ed25519 + ChaCha20-Poly1305)
- ✅ Mesh networking (WebRTC peer-to-peer)
- ✅ Message persistence (IndexedDB)
- ✅ Perfect Forward Secrecy (session keys)
- ✅ Peer reputation system
- ✅ Connection health monitoring

### Data Sovereignty
- ✅ **100% local storage** - No servers, no tracking
- ✅ **Export all data** - One-click JSON download
- ✅ **Import data** - Restore from backup
- ✅ **Delete all data** - Secure confirmation required
- ✅ **Storage transparency** - See exactly what's stored

### User Interface
- ✅ Clean, accessible UI
- ✅ Dark theme
- ✅ Settings panel with sovereignty controls
- ✅ Connection status
- ✅ Demo mode for testing
- ✅ Responsive design

## 🔒 Security Features

1. **Cryptography:**
   - Ed25519 for signing
   - X25519 for key exchange
   - XChaCha20-Poly1305 for encryption
   - All crypto via audited @noble libraries

2. **Network Security:**
   - HTTPS enforced (via deployment configs)
   - Strict CSP headers
   - No third-party tracking
   - WebRTC encrypted channels

3. **Data Protection:**
   - Local-only storage (IndexedDB)
   - No server-side data
   - User-controlled backups
   - Secure deletion

## 📊 Performance Targets

- Bundle size: <250KB gzipped
- Initial load: <2s on 3G
- Supports 50+ simultaneous peers
- Message latency: <100ms
- Offline-capable (PWA ready)

## 🧪 Testing

```bash
# Run core library tests
cd core && npm test

# Tests included:
# - 613 passing tests
# - Crypto operations
# - Mesh networking
# - Persistence (new in V1)
```

## 📝 Post-Deployment Checklist

- [ ] Verify HTTPS is enforced
- [ ] Test export/import functionality
- [ ] Verify Settings panel accessible
- [ ] Test message persistence (refresh page)
- [ ] Verify peer connections work
- [ ] Test on multiple browsers
- [ ] Mobile responsiveness check
- [ ] Accessibility audit (screen reader)

## 🌐 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome)

**Requirements:**
- IndexedDB support
- WebRTC support
- ES2020+ JavaScript

## 🔮 Future Roadmap (Post-V1)

- [ ] Android app with Room persistence
- [ ] iOS app with CoreData persistence
- [ ] Cross-platform data export format
- [ ] BLE mesh networking
- [ ] mDNS local discovery
- [ ] File transfer UI
- [ ] Voice messages
- [ ] Group chats

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## 📄 License

[LICENSE](../LICENSE)

## 🆘 Support

- GitHub Issues: For bug reports
- GitHub Discussions: For questions
- Documentation: `/docs` directory

---

**V1 Status:** ✅ Production Ready (Web)
**Last Updated:** 2024-11-16
