# React Error #310 Debug Plan

## Summary
React error #310 ("Text strings must be rendered within a <Text> component") is appearing in a React web application where it shouldn't exist. This error is specific to React Native and shouldn't appear in standard React DOM apps.

## Current Investigation Status

### Completed
1. ✅ Searched for React Native imports - none found
2. ✅ Checked JSX for text rendering issues - none found
3. ✅ Disabled React StrictMode
4. ✅ Added debug logging to useEffects
5. ✅ Commented out useMeshNetwork hook (suspected source)

### In Progress
- Enabling development environment for full error messages
- Reviewing useEffect dependencies for infinite loops

## Investigation Results

### Files Examined
- `web/src/App.tsx` - Mocked useMeshNetwork, added debug logging
- `web/src/main.tsx` - Disabled StrictMode, added init logging
- `web/src/components/ErrorBoundary.tsx` - Added error tracking
- `web/src/hooks/useMeshNetwork.ts` - Reviewed for issues
- `web/src/bootstrap.ts` - Checked encryption init
- `web/package.json` - No React Native dependencies
- `web/vite.config.ts` - Standard configuration
- `web/index.html` - Clean configuration

## Next Steps

### 1. Enable Development Mode
- Run `npm run dev` locally to see full error messages
- The minified error code #310 may be incorrect in production

### 2. Test with Minimal App
Create a minimal test app to isolate the issue:
```tsx
// TestApp.tsx
export function TestApp() {
  return <div>Hello World</div>;
}
```

### 3. Check Browser Console
- Look for additional warnings before the error
- Check for network requests that might be failing

### 4. Investigate Third-Party Libraries
- Check `@sentry/browser` for any React Native code
- Check all dependencies for compatibility issues

### 5. Review Recent Changes
- Check git history for recent changes that might have introduced the issue
- Look for changes to dependencies or build configuration

## Potential Causes

### High Probability
1. **Minified Error Code Mismatch** - The error code #310 might be incorrect due to minification
2. **Third-Party Library Issue** - A dependency might be causing this error
3. **Race Condition** - Something in the initialization sequence might be causing issues

### Low Probability
1. **React Native Web** - No evidence of this in the codebase
2. **Browser Extension** - Could be interfering with the app
3. **Build Configuration Issue** - Vite config looks standard

## Immediate Actions

1. **Run in Development Mode**
   ```bash
   cd web && npm run dev
   ```
   This will show the full error message instead of the minified version.

2. **Check Network Tab**
   Look for failed requests or unexpected responses during initialization.

3. **Test with Fresh Build**
   ```bash
   cd web && npm run build && npm run preview
   ```

4. **Isolate the Issue**
   Comment out more components one by one to find the source.

## Error Code Analysis

React error #310 is defined as:
```
Text strings must be rendered within a <Text> component
```

This error should NOT exist in React DOM. The fact that it's appearing suggests:
1. The error code might be wrong (minification issue)
2. There's a library injecting React Native code
3. React's production build is somehow misreporting the error

## Recommended Fixes

### If Error Code is Wrong
The actual error might be #321 (Element type is invalid) or another error. Running in dev mode will reveal the true error.

### If Third-Party Library is Causing Issues
- Update all dependencies
- Remove unused dependencies
- Check for library compatibility

### If Initialization Order is Causing Issues
- Add more debug logging
- Use async/await for all initialization
- Add error boundaries around specific components

## Monitoring Points

### Console Logs Added
- `[App] useEffect: Setup logger starting/completed`
- `[App] useEffect: Update peer ID starting/completed`
- `[App] useEffect: Identity initialization starting/completed`
- `[Main] Starting app initialization...`
- `[Main] Encryption initialized, mounting React app...`
- `[Main] React app mounted successfully`
- `[ErrorBoundary] getDerivedStateFromError/componentDidCatch`

### Expected Behavior
The app should:
1. Log encryption initialization
2. Mount React app successfully
3. Show the main UI

### Current Behavior
The app shows "Something went wrong" error, indicating an uncaught exception during rendering.

## Next Debugging Steps

1. Deploy current changes to Netlify
2. Check browser console for debug logs
3. If logs appear, trace where the error occurs
4. If no logs appear, error might be during initial render before logging

## Files Modified

- `web/src/App.tsx` - Mocked useMeshNetwork, added debug logging
- `web/src/main.tsx` - Disabled StrictMode, added init logging
- `web/src/components/ErrorBoundary.tsx` - Added error tracking logging

## Testing Checklist

- [ ] Test in development mode
- [ ] Test with minimal app (only "Hello World")
- [ ] Test with production build locally
- [ ] Test with production build on Netlify
- [ ] Check browser console for additional errors
- [ ] Check network tab for failed requests
- [ ] Review server logs if available

## Success Criteria

The app should:
1. Render successfully in both development and production modes
2. Show no React errors in the console
3. Display the main UI with identity loading state
4. Complete initialization without throwing errors
