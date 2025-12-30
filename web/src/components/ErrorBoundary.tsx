import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    console.error('[ErrorBoundary] getDerivedStateFromError:', error);
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] componentDidCatch:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      console.error('[ErrorBoundary] Rendering error state');
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="error-boundary" style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap', marginBottom: '20px' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.error?.stack}
          </details>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => {
                // Try to reload the page
                window.location.reload();
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => {
                // Clear localStorage and reload (for identity issues)
                try {
                  localStorage.clear();
                } catch (e) {
                  console.warn('Failed to clear localStorage:', e);
                }
                window.location.reload();
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Reset & Reload
            </button>
          </div>
        </div>
      );
    }

    console.log('[ErrorBoundary] Rendering children');
    return this.props.children;
  }
}