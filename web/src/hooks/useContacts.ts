import { useState, useEffect, useCallback } from 'react';
import { getContacts, saveContact, deleteContact, StoredContact } from '../storage';

export function useContacts() {
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshContacts = useCallback(async () => {
    try {
      const storedContacts = await getContacts();
      setContacts(storedContacts);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshContacts();
  }, [refreshContacts]);

  const addContact = useCallback(async (contact: StoredContact) => {
    try {
      await saveContact(contact);
      await refreshContacts();
    } catch (error) {
      console.error('Failed to save contact:', error);
      throw error;
    }
  }, [refreshContacts]);

  const updateContact = useCallback(async (contact: StoredContact) => {
    try {
      await saveContact(contact);
      await refreshContacts();
    } catch (error) {
      console.error('Failed to update contact:', error);
      throw error;
    }
  }, [refreshContacts]);

  const removeContact = useCallback(async (contactId: string) => {
    try {
      await deleteContact(contactId);
      await refreshContacts();
    } catch (error) {
      console.error('Failed to delete contact:', error);
      throw error;
    }
  }, [refreshContacts]);

  return {
    contacts,
    loading,
    addContact,
    updateContact,
    removeContact,
    refreshContacts
  };
}