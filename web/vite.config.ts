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
      output: {
        // Let Vite handle chunking automatically
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
