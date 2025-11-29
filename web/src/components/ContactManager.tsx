import { useState, useEffect } from 'react';
import { StoredContact, getDatabase } from '../storage/database';
import { generateFingerprint, isValidPublicKey, hexToBytes, publicKeyToBase64 } from '@sc/core';

export function ContactManager() {
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', publicKey: '' });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const db = getDatabase();
    const allContacts = await db.getContacts();
    setContacts(allContacts);
  };

  const handleAddContact = async () => {
    if (!newContact.name || !newContact.publicKey) {
      alert("Name and Public Key are required");
      return;
    }

    let publicKeyHex = newContact.publicKey;
    // Basic cleanup
    publicKeyHex = publicKeyHex.replace(/\s/g, '');

    if (!isValidPublicKey(publicKeyHex)) {
      alert("Invalid Public Key format (must be 32 bytes hex)");
      return;
    }

    try {
      const publicKeyBytes = hexToBytes(publicKeyHex);
      const publicKeyBase64 = publicKeyToBase64(publicKeyBytes);
      const fingerprint = await generateFingerprint(publicKeyBytes);

      const contact: StoredContact = {
        id: publicKeyHex, // Use public key (hex) as ID for consistency
        displayName: newContact.name,
        publicKey: publicKeyBase64,
        lastSeen: Date.now(),
        fingerprint,
        verified: false,
        createdAt: Date.now(),
        blocked: false,
        endpoints: [{ type: 'webrtc' }]
      };

      const db = getDatabase();
      await db.saveContact(contact);
      await loadContacts();
      setNewContact({ name: '', publicKey: '' });
      setShowAddDialog(false);
    } catch (error) {
      console.error('Error adding contact:', error);
      alert('Failed to add contact: ' + (error as Error).message);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      const db = getDatabase();
      await db.deleteContact(contactId);
      await loadContacts();
    }
  };

  const handleVerifyContact = async (contact: StoredContact) => {
    const db = getDatabase();
    await db.saveContact({ ...contact, verified: true });
    await loadContacts();
  };

  const filteredContacts = contacts.filter(contact =>
    contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.publicKey.includes(searchQuery)
  );

  return (
    <div className="contact-manager">
      <div className="contact-header">
        <h2>Contacts</h2>
        <button onClick={() => setShowAddDialog(true)} className="add-contact-btn">
          + Add Contact
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="contact-list">
        {filteredContacts.length === 0 ? (
          <div className="empty-state">
            <p>No contacts yet</p>
            <p className="secondary">Add a contact to start messaging</p>
          </div>
        ) : (
          filteredContacts.map(contact => (
            <div key={contact.id} className="contact-item">
              <div className="contact-avatar">
                {contact.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="contact-info">
                <div className="contact-name">{contact.displayName}</div>
                <div className="contact-key" title={contact.fingerprint}>
                  {contact.fingerprint.substring(0, 16)}...
                </div>
              </div>
              <div className="contact-actions">
                {!contact.verified && (
                  <button
                    onClick={() => handleVerifyContact(contact)}
                    className="verify-btn"
                    title="Verify contact"
                  >
                    Verify
                  </button>
                )}
                <button
                  onClick={() => handleDeleteContact(contact.id)}
                  className="delete-btn"
                  title="Delete contact"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showAddDialog && (
        <div className="dialog-overlay" onClick={() => setShowAddDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Add Contact</h3>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={newContact.name}
                onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                placeholder="Enter contact name"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Public Key</label>
              <input
                type="text"
                value={newContact.publicKey}
                onChange={(e) => setNewContact({ ...newContact, publicKey: e.target.value })}
                placeholder="Enter public key or scan QR code"
              />
            </div>
            <div className="dialog-actions">
              <button onClick={() => setShowAddDialog(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={handleAddContact} className="primary-btn">
                Add Contact
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
