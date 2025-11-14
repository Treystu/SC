/**
 * Accessibility Utilities and Constants
 * WCAG 2.1 AA Compliance helpers
 */

/**
 * Keyboard navigation keys
 */
export const Keys = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
} as const;

/**
 * ARIA roles for common UI patterns
 */
export const Roles = {
  BUTTON: 'button',
  LINK: 'link',
  MENU: 'menu',
  MENUITEM: 'menuitem',
  TAB: 'tab',
  TABPANEL: 'tabpanel',
  DIALOG: 'dialog',
  ALERTDIALOG: 'alertdialog',
  LISTBOX: 'listbox',
  OPTION: 'option',
} as const;

/**
 * Focus management utilities
 */
export const focusManagement = {
  /**
   * Trap focus within an element
   */
  trapFocus: (element: HTMLElement) => {
    const focusableElements = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== Keys.TAB) return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    element.addEventListener('keydown', handleKeyDown);
    return () => element.removeEventListener('keydown', handleKeyDown);
  },

  /**
   * Return focus to previously focused element
   */
  createFocusReturn: () => {
    const previouslyFocused = document.activeElement as HTMLElement;
    return () => previouslyFocused?.focus();
  },
};

/**
 * Screen reader announcements
 */
export const announce = {
  /**
   * Create a live region for screen reader announcements
   */
  createLiveRegion: (politeness: 'polite' | 'assertive' = 'polite') => {
    const region = document.createElement('div');
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    region.className = 'sr-only';
    region.style.position = 'absolute';
    region.style.left = '-10000px';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.overflow = 'hidden';
    document.body.appendChild(region);
    return region;
  },

  /**
   * Announce a message to screen readers
   */
  message: (text: string, politeness: 'polite' | 'assertive' = 'polite') => {
    const region = announce.createLiveRegion(politeness);
    region.textContent = text;
    setTimeout(() => region.remove(), 1000);
  },
};

/**
 * Color contrast checker (WCAG 2.1 AA requires 4.5:1 for normal text)
 */
export const colorContrast = {
  /**
   * Calculate relative luminance
   */
  getLuminance: (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  },

  /**
   * Calculate contrast ratio between two colors
   */
  getContrastRatio: (rgb1: [number, number, number], rgb2: [number, number, number]): number => {
    const lum1 = colorContrast.getLuminance(...rgb1);
    const lum2 = colorContrast.getLuminance(...rgb2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  },

  /**
   * Check if contrast meets WCAG AA standards
   */
  meetsWCAG_AA: (rgb1: [number, number, number], rgb2: [number, number, number]): boolean => {
    return colorContrast.getContrastRatio(rgb1, rgb2) >= 4.5;
  },
};

/**
 * Skip link component for keyboard navigation
 */
export const skipLinkStyles = `
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    background: #000;
    color: #fff;
    padding: 8px;
    text-decoration: none;
    z-index: 100;
  }
  
  .skip-link:focus {
    top: 0;
  }
`;
