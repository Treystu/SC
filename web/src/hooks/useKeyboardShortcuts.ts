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
      // Merge default shortcuts with custom ones
      // Custom shortcuts override defaults if keys match
      const allShortcuts = [...customShortcuts];

      for (const shortcut of allShortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : true;
        const altMatch = shortcut.alt ? event.altKey : true;
        const shiftMatch = shortcut.shift ? event.shiftKey : true;

        if (
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlMatch &&
          altMatch &&
          shiftMatch
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
