/**
 * Web Application Type Definitions
 */

export interface Message {
  id: string;
  content: string;
  timestamp: number;
  from: string;
  to?: string;
  status?: 'sent' | 'delivered' | 'read' | 'pending' | 'failed';
}

export interface Conversation {
  id: string;
  name: string;
  lastMessage?: Message;
  unreadCount: number;
}

export interface Contact {
  id: string;
  name: string;
  publicKey: string;
  lastSeen?: number;
  isOnline?: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  notifications: boolean;
  soundEnabled: boolean;
}
