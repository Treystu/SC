import * as Sentry from "@sentry/browser";

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
      tracesSampleRate: environment === "production" ? 0.1 : 1.0,
      beforeSend(event, _hint) {
        // Filter out sensitive data
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      },
    });

    this.initialized = true;
  }

  static captureError(error: Error, context?: ErrorContext) {
    console.error("[ErrorTracker]", error, context);

    if (this.initialized) {
      Sentry.captureException(error, {
        extra: context?.metadata,
        tags: {
          action: context?.action,
        },
        user: context?.userId ? { id: context.userId } : undefined,
      });
    }
  }

  static captureMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
    context?: ErrorContext,
  ) {
    console.log(`[ErrorTracker] ${level}:`, message, context);

    if (this.initialized) {
      Sentry.captureMessage(message, {
        level,
        extra: context?.metadata,
        tags: {
          action: context?.action,
        },
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
const isProd =
  typeof process !== "undefined"
    ? process.env.NODE_ENV === "production"
    : typeof window !== "undefined" && (window as any).__PROD__
      ? (window as any).__PROD__
      : false;

const sentryDsn =
  typeof process !== "undefined"
    ? process.env.VITE_SENTRY_DSN
    : typeof window !== "undefined" && (window as any).__VITE_SENTRY_DSN__
      ? (window as any).__VITE_SENTRY_DSN__
      : undefined;

const environment =
  typeof process !== "undefined"
    ? process.env.NODE_ENV
    : typeof window !== "undefined" && (window as any).__DEV__
      ? "development"
      : undefined;

if (isProd && sentryDsn && environment) {
  ErrorTracker.initialize(sentryDsn, environment);
}
