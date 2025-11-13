import { useState, useEffect } from 'react';
import { Contact, getContacts, saveContact, deleteContact } from '../storage';

export function ContactManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', publicKey: '' });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const allContacts = await getContacts();
    setContacts(allContacts);
  };

  const handleAddContact = async () => {
    if (!newContact.name || !newContact.publicKey) {
      return;
    }

    const contact: Contact = {
      id: crypto.randomUUID(),
      name: newContact.name,
      publicKey: newContact.publicKey,
      lastSeen: Date.now(),
      verified: false
    };

    await saveContact(contact);
    await loadContacts();
    setNewContact({ name: '', publicKey: '' });
    setShowAddDialog(false);
  };

  const handleDeleteContact = async (contactId: string) => {
    if (confirm('Are you sure you want to delete this contact?')) {
      await deleteContact(contactId);
      await loadContacts();
    }
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="contact-info">
                <div className="contact-name">{contact.name}</div>
                <div className="contact-key">
                  {contact.publicKey.substring(0, 16)}...
                </div>
              </div>
              {contact.verified && (
                <div className="verified-badge" title="Verified">✓</div>
              )}
              <button
                onClick={() => handleDeleteContact(contact.id)}
                className="delete-btn"
                title="Delete contact"
              >
                ×
              </button>
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
