# Sovereign Communications - Web Application

Production-ready Progressive Web App (PWA) for the Sovereign Communications decentralized mesh network platform.

## Overview

The web application is built with modern web technologies and provides a secure, responsive interface for mesh networking communication. It runs entirely in the browser with no server dependencies.

## Technology Stack

- **Framework**: React 19.2
- **Build Tool**: Vite 5.0
- **Language**: TypeScript 5.3
- **Architecture**: Component-based with React hooks
- **Storage**: IndexedDB for local persistence
- **Networking**: WebRTC for peer-to-peer connections
- **Styling**: CSS Modules with dark theme

## Project Structure

```
web/
├── src/
│   ├── components/          # React components
│   │   ├── App.tsx         # Main application component
│   │   ├── ChatView.tsx    # Chat interface
│   │   ├── ConnectionStatus.tsx
│   │   ├── ConversationList.tsx
│   │   ├── MessageInput.tsx
│   │   └── NetworkDiagnostics.tsx  # Network diagnostics panel
│   ├── hooks/              # Custom React hooks
│   │   └── useMeshNetwork.ts
│   ├── styles/             # CSS stylesheets
│   └── main.tsx            # Application entry point
├── public/                 # Static assets
├── dist/                   # Build output
├── index.html             # HTML template
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── vite.config.ts         # Vite config
├── netlify.toml           # Netlify deployment config
└── vercel.json            # Vercel deployment config

```

## Features

### Core Functionality ✅

- **Mesh Network Integration**: Direct integration with `@sc/core` library
- **Real-time Messaging**: WebRTC-based peer-to-peer communication
- **Conversation Management**: List of conversations with unread counts
- **Connection Status**: Visual indicator of mesh network connectivity
- **Message History**: Persistent storage with IndexedDB
- **Dark Theme**: Modern, responsive dark UI

### NetworkDiagnostics 🆕

The `NetworkDiagnostics` component provides real-time monitoring:
- Connected peer count (BLE and WebRTC breakdown)
- Message throughput (sent/received)
- Network latency metrics (average, min, max)
- Packet loss percentage
- Bandwidth usage (upload/download)
- Connection distribution visualization
- Configurable refresh intervals (0.5s to 5s)

**Usage**: Accessible via the signal icon (📶) in the header.

### IndexedDB Storage

Object stores:
- `identities`: User identity keypairs
- `contacts`: Peer contacts with public keys
- `conversations`: Conversation metadata
- `messages`: Encrypted message history
- `sessionKeys`: Ephemeral session keys

## Development

### Installation

```bash
cd web
npm install
```

### Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (default Vite port)

### Building for Production

```bash
npm run build
```

Output will be in `web/dist/`

### Preview Production Build

```bash
npm run preview
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Deployment

### Netlify

Configuration in `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 18
- Security headers configured
- SPA redirect rules

### Vercel

Configuration in `vercel.json`:
- Custom security headers
- SPA rewrites configured
- Build settings optimized

### Manual Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy the `dist/` folder to any static hosting service:
   - AWS S3 + CloudFront
   - GitHub Pages
   - Firebase Hosting
   - Any CDN or static host

## Security Features

- **Content Security Policy**: Strict CSP headers
- **HTTPS Only**: HSTS enabled with preload
- **No Tracking**: Privacy-first, no analytics
- **End-to-End Encryption**: All messages encrypted via `@sc/core`
- **Local-First**: No data sent to servers

## Performance Targets

- ✅ **Bundle Size**: < 500KB gzipped
- ✅ **First Contentful Paint**: < 1.5s
- ✅ **Time to Interactive**: < 3s
- ✅ **Lighthouse Score**: 90+ across all metrics

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

**Requirements**:
- ES2020+ support
- WebRTC support
- IndexedDB support
- WebAssembly support (for crypto operations)

## Environment Variables

No environment variables required - fully client-side application.

## API Integration

The web app integrates with `@sc/core` library:

```typescript
import { 
  MeshNetwork,
  generateIdentity,
  encryptMessage,
  decryptMessage
} from '@sc/core';

// Initialize mesh network
const network = new MeshNetwork(identity);

// Send encrypted message
await network.sendMessage(recipientId, message);
```

See [Core Library Documentation](../core/README.md) for full API reference.

## Components

### NetworkDiagnostics

Real-time network monitoring dashboard showing:
- Connection statistics
- Message throughput
- Latency metrics
- Bandwidth usage
- Transport breakdown (BLE/WebRTC)

### ChatView

Main chat interface with:
- Message bubbles
- Delivery status indicators
- Timestamp display
- Typing indicators (planned)

### ConversationList

Conversation list with:
- Unread badges
- Last message preview
- Pinned conversations
- Search/filter (planned)

## Known Limitations

- Service Worker for offline support not yet implemented
- File transfers in progress
- Voice messages planned
- Group messaging planned

## Future Enhancements

- [ ] Service Worker for offline capability
- [ ] File transfer UI
- [ ] Voice message recording
- [ ] QR code scanner for peer discovery
- [ ] Network topology visualization
- [ ] Group chat UI
- [ ] Message search

## Contributing

When contributing to the web app:

1. Follow React best practices
2. Use TypeScript for type safety
3. Write tests for new components
4. Ensure accessibility (WCAG AA)
5. Test across browsers
6. Update this documentation

## Resources

- [React Documentation](https://react.dev/)
- [Vite Guide](https://vitejs.dev/guide/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

## License

See main project [LICENSE](../LICENSE) file.
