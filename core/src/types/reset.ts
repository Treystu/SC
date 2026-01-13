/**
 * Unified reset system types
 * Single source of truth for all reset-related interfaces
 */

export interface ResetResult {
  success: boolean;
  platform: string;
  clearedItems: string[];
  errors?: string[];
  timestamp: number;
  verificationStatus?: 'pending' | 'verified' | 'failed';
}

export interface ResetConfig {
  clearIdentity: boolean;
  clearMessages: boolean;
  clearContacts: boolean;
  clearConversations: boolean;
  clearRoutes: boolean;
  clearSettings: boolean;
  clearCache: boolean;
  clearAll: boolean;
}

export interface PlatformResetCapabilities {
  canClearIdentity: boolean;
  canClearMessages: boolean;
  canClearContacts: boolean;
  canClearConversations: boolean;
  canClearRoutes: boolean;
  canClearSettings: boolean;
  canClearCache: boolean;
  supportsVerification: boolean;
}

export interface ResetVerificationOptions {
  checkIdentity: boolean;
  checkMessages: boolean;
  checkContacts: boolean;
  checkConversations: boolean;
  checkRoutes: boolean;
  checkSettings: boolean;
  checkCache: boolean;
  strictMode: boolean;
}
