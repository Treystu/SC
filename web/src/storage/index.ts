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

// Timeout for database operations
const DB_OPERATION_TIMEOUT = 5000;

// ContactManager functions implemented with DatabaseManager
export async function getContacts(): Promise<Contact[]> {
  const db = getDatabase();
  await Promise.race([
    db.init(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB init timed out')), DB_OPERATION_TIMEOUT)
    )
  ]);
  return db.getContacts();
}

export async function saveContact(contact: Contact): Promise<void> {
  const db = getDatabase();
  await Promise.race([
    db.init(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB init timed out')), DB_OPERATION_TIMEOUT)
    )
  ]);
  return db.saveContact(contact);
}

export async function deleteContact(contactId: string): Promise<void> {
  const db = getDatabase();
  await Promise.race([
    db.init(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB init timed out')), DB_OPERATION_TIMEOUT)
    )
  ]);
  return db.deleteContact(contactId);
}
