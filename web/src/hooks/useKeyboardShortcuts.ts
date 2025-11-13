import { useEffect } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

const shortcuts: ShortcutConfig[] = [
  {
    key: 'n',
    ctrl: true,
    description: 'New conversation',
    action: () => console.log('New conversation')
  },
  {
    key: 'k',
    ctrl: true,
    description: 'Search',
    action: () => console.log('Search')
  },
  {
    key: 's',
    ctrl: true,
    description: 'Settings',
    action: () => console.log('Settings')
  },
  {
    key: 'Escape',
    description: 'Close modal',
    action: () => console.log('Close modal')
  }
];

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey || event.metaKey : true;
        const altMatch = shortcut.alt ? event.altKey : true;
        const shiftMatch = shortcut.shift ? event.shiftKey : true;
        
        if (
          event.key === shortcut.key &&
          ctrlMatch &&
          altMatch &&
          shiftMatch
        ) {
          event.preventDefault();
          shortcut.action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return shortcuts;
}
