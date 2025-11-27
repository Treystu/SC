import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './sentry'; // Sentry is initialized in sentry.ts
import './index.css';

// Register service worker for PWA support
// Unregister service worker to clear cache issues
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    registration.unregister();
    console.log('Service Worker unregistered');
  });
}

console.log('Main.tsx executing...');
// alert('Main.tsx executing'); // Visual confirmation

const rootElement = document.getElementById('root');
console.log('Root element:', rootElement);

if (!rootElement) {
  console.error('Failed to find the root element');
} else {
  console.log('Mounting React app...');
  ReactDOM.createRoot(rootElement).render(
    <App />
  );
}
