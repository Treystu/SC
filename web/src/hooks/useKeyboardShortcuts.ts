import { useEffect } from 'react';

export interface ShortcutAction {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(customShortcuts: ShortcutAction[] = []) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const defaultShortcuts: ShortcutAction[] = [
        // Add default shortcuts here if needed
      ];

      // Custom shortcuts take precedence
      const allShortcuts = [...customShortcuts, ...defaultShortcuts];

      for (const shortcut of allShortcuts) {
        const isCtrl = event.ctrlKey || event.metaKey;
        const isAlt = event.altKey;
        const isShift = event.shiftKey;

        const reqCtrl = !!shortcut.ctrl;
        const reqAlt = !!shortcut.alt;
        const reqShift = !!shortcut.shift;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          isCtrl === reqCtrl &&
          isAlt === reqAlt &&
          isShift === reqShift
        ) {
          event.preventDefault();
          shortcut.action();
          return; // Execute only one shortcut
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [customShortcuts]);
}
