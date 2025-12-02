/**
 * Toast notification system
 * Provides context-based toast notifications for user feedback
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  timestamp: number;
}

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, options?: ToastOptions) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_DURATION = 3000;

/**
 * Generate a unique toast ID
 */
function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
}

/**
 * Toast Provider component - wrap your app with this to enable toasts
 */
export function ToastProvider({ children, maxToasts = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, options: ToastOptions = {}) => {
    const { type = 'info', duration = DEFAULT_DURATION } = options;
    
    const newToast: Toast = {
      id: generateId(),
      message,
      type,
      duration,
      timestamp: Date.now(),
    };

    setToasts((prev) => {
      // Limit number of toasts
      const updated = [...prev, newToast];
      if (updated.length > maxToasts) {
        return updated.slice(-maxToasts);
      }
      return updated;
    });

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(newToast.id);
      }, duration);
    }
  }, [maxToasts, removeToast]);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast, clearAll }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * Hook to access toast functionality
 */
export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

/**
 * Toast container component - renders all active toasts
 */
function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

/**
 * Individual toast item component
 */
function ToastItem({ toast, onRemove }: ToastItemProps) {
  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div
      className={`toast toast-${toast.type}`}
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <span className="toast-icon" aria-hidden="true">
        {icons[toast.type]}
      </span>
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-close"
        onClick={() => onRemove(toast.id)}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
}

// Convenience functions for common toast types
export function useSuccessToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, duration?: number) =>
      showToast(message, { type: 'success', duration }),
    [showToast]
  );
}

export function useErrorToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, duration?: number) =>
      showToast(message, { type: 'error', duration }),
    [showToast]
  );
}

export function useWarningToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, duration?: number) =>
      showToast(message, { type: 'warning', duration }),
    [showToast]
  );
}

export function useInfoToast() {
  const { showToast } = useToast();
  return useCallback(
    (message: string, duration?: number) =>
      showToast(message, { type: 'info', duration }),
    [showToast]
  );
}

export default ToastProvider;
