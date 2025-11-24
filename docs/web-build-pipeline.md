# Web Application Build Pipeline

## Overview

The Sovereign Communications web application is built using Vite, React 18, and TypeScript with optimized production builds.

## Build Configuration

### Technology Stack
- **Build Tool**: Vite 5.4+
- **Framework**: React 18.3
- **Language**: TypeScript 5.3+
- **Bundler**: Rollup (via Vite)

### Build Features

#### Code Splitting
The build configuration implements manual code splitting for optimal loading:
- `react-vendor`: React and React-DOM bundled separately
- `crypto-vendor`: @sc/core cryptography library in dedicated chunk
- Automatic dynamic imports for route-based code splitting

#### Optimization
- **Minification**: Terser with aggressive compression
- **Tree Shaking**: Automatic removal of unused code
- **Source Maps**: Disabled in production for smaller bundle size
- **Console Removal**: All console.log statements removed in production

#### Bundle Analysis
- Bundle size visualization with rollup-plugin-visualizer
- Generated stats available at `dist/stats.html` after build
- Gzip and Brotli size analysis included

## Build Commands

### Development
```bash
npm run dev
```
Starts development server on port 3000 with hot module replacement.

### Production Build
```bash
npm run build
```
Creates optimized production build in `dist/` directory.

Steps:
1. TypeScript compilation and type checking
2. Vite production build with Rollup
3. Asset optimization and compression
4. Bundle analysis report generation

### Preview Production Build
```bash
npm run preview
```
Serves the production build locally for testing.

## Build Output

### Bundle Structure
```
dist/
├── index.html                 # Entry HTML
├── assets/
│   ├── index-[hash].css      # Main styles (gzipped ~2KB)
│   ├── index-[hash].js       # Main bundle (gzipped ~68KB)
│   ├── react-vendor-[hash].js # React libraries
│   └── crypto-vendor-[hash].js # Crypto library
└── stats.html                 # Bundle analysis report
```

### Performance Metrics (Current)
- **Total Bundle Size**: ~203KB uncompressed
- **Gzipped Size**: ~68KB
- **Main CSS**: ~7KB uncompressed, ~2KB gzipped
- **Build Time**: ~1-2 seconds

## Performance Targets

### Bundle Size
- ✅ Total gzipped: < 500KB (current: 68KB)
- ✅ Main JavaScript: < 200KB gzipped
- ✅ CSS: < 50KB gzipped

### Loading Performance
- Target: < 3s initial load on 3G
- Target: < 100ms interaction response
- Target: First Contentful Paint < 1.5s

## Progressive Web App (PWA)

### Service Worker
- Offline-first caching strategy
- Background sync for messages
- Push notification support
- Located at `public/service-worker.js`

### Manifest
- PWA manifest at `public/manifest.json`
- Installable on mobile and desktop
- Custom splash screens
- Share target support

## Deployment

### Static Hosting
The build output is a static site that can be deployed to:
- Vercel
- Netlify
- GitHub Pages
- Any CDN or static host

### Environment Variables
Set via Vite's `.env` files:
```
VITE_API_URL=https://api.example.com
```

### Production Checklist
- [ ] Run `npm run build`
- [ ] Check bundle size in stats.html
- [ ] Test with `npm run preview`
- [ ] Verify service worker registration
- [ ] Test offline functionality
- [ ] Run Lighthouse audit (target: 90+)
- [ ] Deploy to hosting platform

## Optimization Tips

### Further Improvements
1. **Route-based code splitting**: Split components by route
2. **Lazy loading**: Use React.lazy() for heavy components
3. **Image optimization**: Use WebP format with fallbacks
4. **Font loading**: Optimize web font loading strategy
5. **Critical CSS**: Inline critical CSS in HTML head

### Monitoring
- Use Lighthouse for performance audits
- Monitor Core Web Vitals
- Track bundle size over time
- Use browser DevTools Performance tab

## Troubleshooting

### Build Errors
- Clear cache: `rm -rf node_modules/.vite`
- Rebuild dependencies: `npm ci`
- Check TypeScript errors: `npx tsc --noEmit`

### Large Bundle Size
- Analyze with stats.html
- Review dependencies with `npm ls`
- Consider lazy loading for large libraries
- Check for duplicate dependencies

## Related Documentation
- [Vite Configuration](https://vitejs.dev/config/)
- [React Production Build](https://react.dev/learn/start-a-new-react-project)
- [PWA Best Practices](https://web.dev/progressive-web-apps/)
