/**
 * DeepLinkHandler - Handles deep links and universal links for app invites
 *
 * Responsibilities:
 * - Parse various invite URL formats
 * - Handle invite links for new and existing users
 * - Persist invite codes through installation
 * - Support multiple URL schemes (sc://, https://sc.app/join, etc.)
 */

export interface DeepLinkParams {
  code?: string;
  peer?: string;
  [key: string]: string | undefined;
}

export interface ParsedDeepLink {
  action: string;
  params: DeepLinkParams;
}

export type DeepLinkHandler = (params: DeepLinkParams) => Promise<void>;

export interface DeepLinkStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface DeepLinkRouter {
  navigate(path: string): void;
}

/**
 * Manages deep link handling for invite codes and peer connections
 */
export class DeepLinkManager {
  private handlers = new Map<string, DeepLinkHandler>();
  private storage: DeepLinkStorage;
  private router?: DeepLinkRouter;

  constructor(storage: DeepLinkStorage, router?: DeepLinkRouter) {
    this.storage = storage;
    this.router = router;
    this.registerDefaultHandlers();
  }

  /**
   * Register default handlers for common actions
   */
  private registerDefaultHandlers(): void {
    // Handler for join/invite links
    this.handlers.set('join', async (params) => {
      const inviteCode = params.code;
      if (!inviteCode) {
        console.warn('Join link missing invite code');
        return;
      }

      // Check if user is onboarded
      const isOnboarded = await this.isUserOnboarded();

      if (!isOnboarded) {
        // Store for after onboarding
        await this.storage.set('pendingInvite', inviteCode);
        if (params.inviterName) {
          await this.storage.set('pendingInviterName', params.inviterName);
        }
        this.router?.navigate('/onboarding');
      } else {
        // Process immediately - the app will handle this via events
        await this.storage.set('pendingInvite', inviteCode);
        if (params.inviterName) {
          await this.storage.set('pendingInviterName', params.inviterName);
        }
        // Navigate to main app - invite will be processed there
        this.router?.navigate('/');
      }
    });

    // Handler for direct peer connection
    this.handlers.set('connect', async (params) => {
      const peerId = params.peer;
      if (!peerId) {
        console.warn('Connect link missing peer ID');
        return;
      }

      // Store peer ID for connection
      await this.storage.set('pendingPeerConnection', peerId);
      this.router?.navigate('/');
    });
  }

  /**
   * Register a custom handler for an action
   */
  registerHandler(action: string, handler: DeepLinkHandler): void {
    this.handlers.set(action, handler);
  }

  /**
   * Check if user has completed onboarding
   */
  async isUserOnboarded(): Promise<boolean> {
    const onboardingComplete = await this.storage.get('onboarding_complete');
    return onboardingComplete === 'true';
  }

  /**
   * Handle an incoming URL
   */
  async handleURL(url: string): Promise<boolean> {
    const parsed = this.parseURL(url);

    if (!parsed.action) {
      return false;
    }

    const handler = this.handlers.get(parsed.action);
    if (handler) {
      await handler(parsed.params);
      return true;
    }

    console.warn(`No handler registered for action: ${parsed.action}`);
    return false;
  }

  /**
   * Parse various URL formats into action and params
   *
   * Supported formats:
   * - sc://join/INVITE_CODE
   * - sc://connect/PEER_ID
   * - https://sc.app/join#INVITE_CODE
   * - https://sc.app/join?code=INVITE_CODE&inviterName=NAME
   * - #join=INVITE_CODE
   * - /join#INVITE_CODE
   */
  parseURL(url: string): ParsedDeepLink {
    // Handle custom scheme (sc://action/params)
    const customSchemeMatch = url.match(/^sc:\/\/(\w+)\/(.+)/);
    if (customSchemeMatch) {
      return {
        action: customSchemeMatch[1],
        params: this.parseCustomSchemeParams(
          customSchemeMatch[1],
          customSchemeMatch[2]
        ),
      };
    }

    // Handle HTTPS URLs (https://sc.app/action#code or ?params)
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      if (pathParts.length > 0) {
        const action = pathParts[0];

        // Get params from hash or query string
        let params: DeepLinkParams = {};

        // Check hash first (legacy format: /join#CODE)
        // Only accept hash if host is sc.app (for HTTPS URLs)
        if (urlObj.hash && (urlObj.protocol === 'sc:' || urlObj.host === 'sc.app')) {
          const hashValue = urlObj.hash.substring(1);
          if (hashValue.includes('=')) {
            // Hash with params: #key=value&key2=value2
            params = this.parseQueryString(hashValue);
          } else {
            // Simple hash: #INVITE_CODE
            params = { code: hashValue };
          }
        }

        // Also check query parameters
        urlObj.searchParams.forEach((value, key) => {
          params[key] = value;
        });

        return { action, params };
      }
    } catch {
      // Not a valid URL, continue with other formats
    }

    // Handle hash-only format (#action=value)
    const hashMatch = url.match(/^#(\w+)=(.+)/);
    if (hashMatch) {
      return {
        action: hashMatch[1],
        params: { code: hashMatch[2] },
      };
    }

    // Handle path with hash (/action#value)
    const pathHashMatch = url.match(/\/(\w+)#(.+)/);
    if (pathHashMatch) {
      return {
        action: pathHashMatch[1],
        params: { code: pathHashMatch[2] },
      };
    }

    return { action: '', params: {} };
  }

  /**
   * Parse custom scheme parameters
   */
  private parseCustomSchemeParams(action: string, value: string): DeepLinkParams {
    switch (action) {
      case 'join':
        return { code: value };
      case 'connect':
        return { peer: value };
      default:
        return { value };
    }
  }

  /**
   * Parse query string into params object
   */
  private parseQueryString(query: string): DeepLinkParams {
    const params: DeepLinkParams = {};
    const pairs = query.split('&');

    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }

    return params;
  }

  /**
   * Generate an invite URL
   */
  static generateInviteURL(
    baseURL: string,
    inviteCode: string,
    inviterName?: string
  ): string {
    const url = new URL(baseURL);
    url.pathname = '/join';
    url.searchParams.set('code', inviteCode);
    if (inviterName) {
      url.searchParams.set('inviterName', inviterName);
    }
    return url.toString();
  }

  /**
   * Generate a custom scheme invite URL
   */
  static generateCustomSchemeURL(inviteCode: string): string {
    return `sc://join/${inviteCode}`;
  }

  /**
   * Get pending invite code from storage
   */
  async getPendingInvite(): Promise<{ code: string; inviterName?: string } | null> {
    const code = await this.storage.get('pendingInvite');
    if (!code) return null;

    const inviterName = await this.storage.get('pendingInviterName') ?? undefined;
    return { code, inviterName };
  }

  /**
   * Clear pending invite from storage
   */
  async clearPendingInvite(): Promise<void> {
    await this.storage.remove('pendingInvite');
    await this.storage.remove('pendingInviterName');
  }

  /**
   * Get pending peer connection from storage
   */
  async getPendingPeerConnection(): Promise<string | null> {
    return this.storage.get('pendingPeerConnection');
  }

  /**
   * Clear pending peer connection from storage
   */
  async clearPendingPeerConnection(): Promise<void> {
    await this.storage.remove('pendingPeerConnection');
  }
}

/**
 * Web-specific storage adapter using localStorage
 */
export class WebDeepLinkStorage implements DeepLinkStorage {
  async get(key: string): Promise<string | null> {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(`sc-deeplink-${key}`);
  }

  async set(key: string, value: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`sc-deeplink-${key}`, value);
  }

  async remove(key: string): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(`sc-deeplink-${key}`);
  }
}

/**
 * Create a web-based DeepLinkManager
 */
export function createWebDeepLinkManager(): DeepLinkManager {
  const storage = new WebDeepLinkStorage();
  return new DeepLinkManager(storage);
}
