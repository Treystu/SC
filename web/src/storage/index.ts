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

// Placeholder functions for ContactManager
export async function getContacts(): Promise<Contact[]> {
  // TODO: Implement using DatabaseManager
  return [];
}

export async function saveContact(contact: Contact): Promise<void> {
  // TODO: Implement using DatabaseManager
  console.log('Saving contact:', contact);
}

export async function deleteContact(contactId: string): Promise<void> {
  // TODO: Implement using DatabaseManager
  console.log('Deleting contact:', contactId);
}
