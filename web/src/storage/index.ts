/**
 * Storage Layer Exports
 */

export * from './database';

// Re-export common types
export interface Contact {
  id: string;
  publicKey: string;
  name?: string; // Optional for backward compatibility
  displayName: string;
  lastSeen: number;
  fingerprint: string;
  verified: boolean;
}

import { getDatabase, StoredContact } from './database';

// Re-export common types
export interface Contact extends StoredContact {}

// ContactManager functions implemented with DatabaseManager
export async function getContacts(): Promise<Contact[]> {
  const db = getDatabase();
  await db.init();
  return db.getContacts();
}

export async function saveContact(contact: Contact): Promise<void> {
  const db = getDatabase();
  await db.init();
  return db.saveContact(contact);
}

export async function deleteContact(contactId: string): Promise<void> {
  const db = getDatabase();
  await db.init();
  return db.deleteContact(contactId);
}
