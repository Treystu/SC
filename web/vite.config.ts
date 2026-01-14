import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      template: 'treemap',
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
    compression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      // Proxy Netlify functions to the deployed site for local dev
      '/.netlify/functions': {
        target: 'https://sovereigncommunications.netlify.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  define: {
    // 'process.env': {}, // Let Vite handle this
    'global': 'window', // Polyfill global for some older libs if needed
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      // Externalize Node.js-only dependencies that should never be in browser bundle
      external: [
        'jsdom',
        'child_process',
        'fs',
        'path',
        'os',
        'net',
        'tls',
        'http',
        'https',
        'zlib',
        'stream',
        'crypto',
        'vm',
        'util',
        'assert',
        'url',
      ],
      output: {
        // Code-split to reduce chunk sizes
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'react-vendor';
            }
            if (id.includes('@noble')) {
              return 'crypto-vendor';
            }
            if (id.includes('qrcode')) {
              return 'qr-vendor';
            }
            if (id.includes('dompurify')) {
              return 'dompurify';
            }
            if (id.includes('fflate')) {
              return 'compression';
            }
          }
          // Split core library code
          if (id.includes('/core/dist/')) {
            if (id.includes('mesh/') || id.includes('routing') || id.includes('gossip') || id.includes('dht')) {
              return 'mesh-core';
            }
            if (id.includes('crypto/') || id.includes('primitives') || id.includes('envelope')) {
              return 'crypto-core';
            }
            if (id.includes('transport/') || id.includes('webrtc')) {
              return 'transport-core';
            }
            if (id.includes('discovery/')) {
              return 'discovery-core';
            }
          }
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
})
