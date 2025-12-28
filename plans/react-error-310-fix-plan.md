# React Error #310 Remediation Plan

## Error Summary
- **Error**: Minified React error #310 ("Text strings must be rendered within a <Text> component")
- **Occurrence**: Initial page load / app startup
- **Location**: Netlify deployment (sovcom.netlify.app)

## Root Cause Analysis

React error #310 is typically a **React Native-specific error** that shouldn't occur in a standard React web application. This suggests one of the following:

1. **React Native Web usage**: A component or library is using React Native Web (RNW) which has different rendering requirements
2. **Third-party library issue**: A dependency might be causing cross-platform rendering conflicts
3. **Minified error code mismatch**: The production build's minification might be causing incorrect error codes to be reported
4. **Conditional rendering issue**: Text being rendered conditionally outside proper JSX elements during initialization

## Investigation Steps

### Step 1: Enable Development Environment for Full Error Messages

The production build uses minified error messages. To get the full error:

1. Access the app in development mode:
   ```bash
   cd web && npm run dev
   ```

2. Or configure Netlify to deploy from a dev build with source maps enabled

### Step 2: Search for React Native Imports

Search the codebase for any React Native or React Native Web imports:

```bash
# Search for react-native imports
grep -r "react-native" web/src/ --include="*.tsx" --include="*.ts"

# Search for @react-native-web imports
grep -r "@react-native-web" web/src/ --include="*.tsx" --include="*.ts"
```

### Step 3: Check Package Dependencies

Review web/package.json for any React Native related dependencies:

```json
// Check for these suspicious dependencies
"react-native": "*",
"react-native-web": "*",
"react-native-dom": "*",
"expo": "*"
```

### Step 4: Review Conditional Rendering in App.tsx

The error occurs during initialization in [`App.tsx`](web/src/App.tsx). Key areas to review:

1. **Lines 183-185**: Loading state with `identityReady`
   ```tsx
   if (!identityReady) {
     return <div className="app-loading">Loading identity...</div>;
   }
   ```

2. **Lines 1015-1019**: Offline banner conditional rendering
   ```tsx
   {!status.isConnected && (
     <div className="offline-banner" data-testid="offline-indicator">
       Offline - attempting to reconnect
     </div>
   )}
   ```

3. **Lines 956-964**: Toast notification rendering
   ```tsx
   {toast && (
     <div data-testid="notification-toast" className="notification-toast" role="status">
       {toast.message}
     </div>
   )}
   ```

### Step 5: Review useMeshNetwork Hook Initialization

The [`useMeshNetwork.ts`](web/src/hooks/useMeshNetwork.ts) hook has multiple useEffects that initialize during app startup:

1. **Lines 54-66**: Identity state update effect
2. **Lines 69-514**: Main mesh network initialization effect
3. **Lines 1286-1301**: Auto-join public room effect
4. **Lines 1304-1323**: Auto-connect to discovered peers effect
5. **Lines 1328-1349**: DHT bootstrap effect

### Step 6: Test with React StrictMode Disabled

React StrictMode can sometimes cause issues with initialization code. Temporarily disable it in [`main.tsx`](web/src/main.tsx):

```tsx
// Before (line 57-63)
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

// After (temporary fix for testing)
ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
```

### Step 7: Add Debug Logging to Isolate the Failing Component

Add console logging to identify which component is causing the error:

```tsx
// In App.tsx useEffects
useEffect(() => {
  console.log('[Debug] Identity effect starting');
  // ... existing code
  console.log('[Debug] Identity effect completed');
}, [identity, status.localPeerId]);
```

### Step 8: Check Sentry Integration

The app uses Sentry for error tracking. Check [`sentry.ts`](web/src/sentry.ts) for any misconfiguration that might be causing the error to be incorrectly reported.

## Remediation Options

### Option A: If React Native Web is Found

1. Remove the React Native Web dependency from `web/package.json`
2. Replace any RNW-specific components with React DOM equivalents
3. Ensure all imports are from `react` not `react-native`

### Option B: If Conditional Rendering Issue

Ensure all text is properly wrapped:

```tsx
// Before (incorrect)
<div>
  Some text here
  {condition && <span>More text</span>}
</div>

// After (correct)
<div>
  <span>Some text here</span>
  {condition && <span>More text</span>}
</div>
```

### Option C: If Third-Party Library Issue

1. Identify the problematic library from imports
2. Check for alternative React DOM-only versions
3. Consider using dynamic imports to load the library only when needed

### Option D: If Minified Error Code Mismatch

The error code #310 might be incorrect in the minified build. Focus on:
1. Getting the full error message from development mode
2. Identifying the actual error based on the stack trace
3. Fixing the underlying issue

## Immediate Actions

1. **Switch to development mode** to see the full error message
2. **Check recent git history** for changes to `web/package.json` or `web/src/App.tsx`
3. **Verify build configuration** in `web/vite.config.ts` for any React Native Web plugins
4. **Test locally** with `npm run dev` to reproduce the issue

## Verification

After implementing a fix:

1. Test in development mode first
2. Build for production: `npm run build`
3. Preview production build: `npm run preview`
4. Deploy to staging and verify the error is resolved
