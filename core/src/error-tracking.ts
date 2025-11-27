import * as Sentry from '@sentry/browser';

export interface ErrorContext {
  userId?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export class ErrorTracker {
  private static initialized = false;

  static initialize(dsn: string, environment: string) {
    if (this.initialized) return;

    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      beforeSend(event, hint) {
        // Filter out sensitive data
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      }
    });

    this.initialized = true;
  }

  static captureError(error: Error, context?: ErrorContext) {
    console.error('[ErrorTracker]', error, context);

    if (this.initialized) {
      Sentry.captureException(error, {
        extra: context?.metadata,
        tags: {
          action: context?.action
        },
        user: context?.userId ? { id: context.userId } : undefined
      });
    }
  }

  static captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: ErrorContext) {
    console.log(`[ErrorTracker] ${level}:`, message, context);

    if (this.initialized) {
      Sentry.captureMessage(message, {
        level,
        extra: context?.metadata,
        tags: {
          action: context?.action
        }
      });
    }
  }

  static setUser(userId: string) {
    if (this.initialized) {
      Sentry.setUser({ id: userId });
    }
  }

  static clearUser() {
    if (this.initialized) {
      Sentry.setUser(null);
    }
  }
}

// Initialize in production
// Use typeof check to support both Vite (import.meta.env) and Node.js (process.env)
const isProd = typeof process !== 'undefined'
  ? process.env.NODE_ENV === 'production'
  : (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD);

const sentryDsn = typeof process !== 'undefined'
  ? process.env.VITE_SENTRY_DSN
  : (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SENTRY_DSN : undefined);

const environment = typeof process !== 'undefined'
  ? process.env.NODE_ENV
  : (typeof import.meta !== 'undefined' ? (import.meta as any).env?.MODE : undefined);

if (isProd && sentryDsn && environment) {
  ErrorTracker.initialize(sentryDsn, environment);
}