import React, { useEffect, useState } from 'react';

interface AccessibilitySettings {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
  focusIndicators: boolean;
}

export const Accessibility: React.FC = () => {
  const [settings, setSettings] = useState<AccessibilitySettings>({
    highContrast: false,
    largeText: false,
    reduceMotion: false,
    screenReaderOptimized: false,
    keyboardNavigation: true,
    focusIndicators: true
  });

  useEffect(() => {
    // Apply settings to document
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.classList.toggle('large-text', settings.largeText);
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    document.documentElement.setAttribute('data-keyboard-nav', String(settings.keyboardNavigation));
  }, [settings]);

  useEffect(() => {
    // Detect user preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    
    setSettings(prev => ({
      ...prev,
      reduceMotion: prefersReducedMotion,
      highContrast: prefersHighContrast
    }));
  }, []);

  return (
    <div className="accessibility-settings" role="region" aria-label="Accessibility Settings">
      <h2 id="accessibility-heading">Accessibility Settings</h2>
      
      <fieldset aria-labelledby="accessibility-heading">
        <legend className="sr-only">Visual Preferences</legend>
        
        <label htmlFor="high-contrast">
          <input
            id="high-contrast"
            type="checkbox"
            checked={settings.highContrast}
            onChange={(e) => setSettings({...settings, highContrast: e.target.checked})}
            aria-describedby="high-contrast-desc"
          />
          <span>High Contrast Mode</span>
        </label>
        <p id="high-contrast-desc" className="setting-description">
          Increases contrast for better visibility
        </p>

        <label htmlFor="large-text">
          <input
            id="large-text"
            type="checkbox"
            checked={settings.largeText}
            onChange={(e) => setSettings({...settings, largeText: e.target.checked})}
            aria-describedby="large-text-desc"
          />
          <span>Large Text (150%)</span>
        </label>
        <p id="large-text-desc" className="setting-description">
          Increases text size throughout the app
        </p>

        <label htmlFor="reduce-motion">
          <input
            id="reduce-motion"
            type="checkbox"
            checked={settings.reduceMotion}
            onChange={(e) => setSettings({...settings, reduceMotion: e.target.checked})}
            aria-describedby="reduce-motion-desc"
          />
          <span>Reduce Motion</span>
        </label>
        <p id="reduce-motion-desc" className="setting-description">
          Minimizes animations and transitions
        </p>

        <label htmlFor="screen-reader">
          <input
            id="screen-reader"
            type="checkbox"
            checked={settings.screenReaderOptimized}
            onChange={(e) => setSettings({...settings, screenReaderOptimized: e.target.checked})}
            aria-describedby="screen-reader-desc"
          />
          <span>Screen Reader Optimizations</span>
        </label>
        <p id="screen-reader-desc" className="setting-description">
          Enhanced announcements for screen readers
        </p>

        <label htmlFor="focus-indicators">
          <input
            id="focus-indicators"
            type="checkbox"
            checked={settings.focusIndicators}
            onChange={(e) => setSettings({...settings, focusIndicators: e.target.checked})}
            aria-describedby="focus-indicators-desc"
          />
          <span>Enhanced Focus Indicators</span>
        </label>
        <p id="focus-indicators-desc" className="setting-description">
          Makes keyboard focus more visible
        </p>
      </fieldset>

      <div className="keyboard-shortcuts" role="region" aria-label="Keyboard Shortcuts">
        <h3>Keyboard Shortcuts</h3>
        <dl>
          <dt><kbd>Ctrl</kbd> + <kbd>N</kbd></dt>
          <dd>New conversation</dd>
          
          <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt>
          <dd>Search messages</dd>
          
          <dt><kbd>Esc</kbd></dt>
          <dd>Close dialog</dd>
          
          <dt><kbd>Tab</kbd></dt>
          <dd>Navigate forward</dd>
          
          <dt><kbd>Shift</kbd> + <kbd>Tab</kbd></dt>
          <dd>Navigate backward</dd>
          
          <dt><kbd>Enter</kbd></dt>
          <dd>Send message / Activate button</dd>
        </dl>
      </div>
    </div>
  );
};

// Skip to main content link for screen readers
export const SkipLink: React.FC = () => (
  <a href="#main-content" className="skip-link">
    Skip to main content
  </a>
);

// Live region for announcements
export const LiveRegion: React.FC<{ message: string; priority?: 'polite' | 'assertive' }> = ({ 
  message, 
  priority = 'polite' 
}) => (
  <div 
    role="status" 
    aria-live={priority}
    aria-atomic="true"
    className="sr-only"
  >
    {message}
  </div>
);
