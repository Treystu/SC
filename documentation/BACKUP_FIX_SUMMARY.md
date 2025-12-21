# Backup & Data Clearing Fixes

## Issues Addressed
1.  **Fake Encryption**: The previous implementation of "Encrypt Backup" did not actually encrypt the data. It just exported the JSON as-is. This led to the user's observation that the password seemed "cached" (because it wasn't needed at all).
2.  **Incomplete Data Clearing**: The "Delete All Local Data" function in Settings only cleared IndexedDB, leaving `localStorage` and `sessionStorage` intact. This caused some state (like onboarding status or keys) to persist even after a "wipe".

## Changes Made
1.  **Implemented Real Encryption**:
    *   Added `encryptData` and `decryptData` functions in `BackupManager.tsx` using `window.crypto.subtle` (PBKDF2 + AES-GCM).
    *   Backups are now securely encrypted with the user-provided password.
    *   Restoring an encrypted backup now *requires* the correct password.
2.  **Robust Data Clearing**:
    *   Updated `handleDeleteAllData` in `SettingsPanel.tsx` to:
        *   Clear IndexedDB (`db.deleteAllData`).
        *   Clear `localStorage`.
        *   Clear `sessionStorage`.
        *   Force a page reload (`window.location.reload()`).
    *   This ensures a true "Factory Reset" experience.
3.  **UI Cleanup**:
    *   Removed the redundant "Danger Zone" I initially added to `BackupManager.tsx` to keep the UI clean, as `SettingsPanel.tsx` now handles the global wipe correctly.

## Verification
*   **Build**: Passed successfully.
*   **Browser Test**: Verified that "Delete All Local Data" correctly wipes all data and returns the app to the Onboarding screen.
