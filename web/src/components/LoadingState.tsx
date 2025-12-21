import React from 'react';

export interface LoadingStateProps {
  loading: boolean;
  error?: string;
  retry?: () => void;
  children: React.ReactNode;
}

export function LoadingState({ loading, error, retry, children }: LoadingStateProps) {
  if (loading) {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="error-state" role="alert">
        <p className="error-message">{error}</p>
        {retry && (
          <button onClick={retry} className="btn btn-primary retry-button">
            Retry
          </button>
        )}
      </div>
    );
  }
  
  return <>{children}</>;
}