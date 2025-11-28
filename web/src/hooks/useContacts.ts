import { useState, useEffect, useCallback } from 'react';
import { getContacts, saveContact, StoredContact } from '../storage';

export function useContacts() {
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadContacts() {
      try {
        const storedContacts = await getContacts();
        setContacts(storedContacts);
      } catch (error) {
        console.error('Failed to load contacts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadContacts();
  }, []);

  const addContact = useCallback(async (contact: StoredContact) => {
    try {
      await saveContact(contact);
      // Re-fetch contacts from the database to ensure the UI is in sync
      const storedContacts = await getContacts();
      setContacts(storedContacts);
    } catch (error) {
      console.error('Failed to save contact:', error);
      // Re-throw the error to make it visible in tests
      throw error;
    }
  }, []);

  return { contacts, loading, addContact };
}