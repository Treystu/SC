// Contact List Component - Display and manage contacts
// Task 218: Contact list UI with search and filtering

import React, { useState, useMemo } from 'react';

interface Contact {
  id: string;
  name: string;
  publicKey: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: number;
  unreadCount: number;
  isPinned: boolean;
}

interface ContactListProps {
  contacts: Contact[];
  onSelectContact: (contactId: string) => void;
  onAddContact: () => void;
  onDeleteContact: (contactId: string) => void;
  selectedContactId?: string;
}

export const ContactList: React.FC<ContactListProps> = ({
  contacts,
  onSelectContact,
  onAddContact,
  selectedContactId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'unread'>('recent');

  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contacts;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((contact) =>
        contact.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((contact) => contact.status === filterStatus);
    }

    // Sort contacts
    const sorted = [...filtered].sort((a, b) => {
      // Pinned contacts always come first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
          return (b.lastSeen || 0) - (a.lastSeen || 0);
        case 'unread':
          return b.unreadCount - a.unreadCount;
        default:
          return 0;
      }
    });

    return sorted;
  }, [contacts, searchQuery, filterStatus, sortBy]);

  const getStatusColor = (status: Contact['status']) => {
    switch (status) {
      case 'online':
        return '#10b981';
      case 'away':
        return '#f59e0b';
      case 'offline':
        return '#6b7280';
    }
  };

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return 'Never';

    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1f2937' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #374151' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ margin: 0, color: '#f9fafb', fontSize: '18px', fontWeight: '600' }}>Contacts</h2>
          <button
            onClick={onAddContact}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            + Add
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: '#374151',
            border: '1px solid #4b5563',
            borderRadius: '6px',
            color: '#f9fafb',
            fontSize: '14px',
          }}
        />

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            style={{
              flex: 1,
              padding: '6px 8px',
              background: '#374151',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              color: '#f9fafb',
              fontSize: '12px',
            }}
          >
            <option value="all">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{
              flex: 1,
              padding: '6px 8px',
              background: '#374151',
              border: '1px solid #4b5563',
              borderRadius: '6px',
              color: '#f9fafb',
              fontSize: '12px',
            }}
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="unread">Unread</option>
          </select>
        </div>
      </div>

      {/* Contact List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredAndSortedContacts.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af' }}>
            {searchQuery ? 'No contacts found' : 'No contacts yet'}
          </div>
        ) : (
          filteredAndSortedContacts.map((contact) => (
            <div
              key={contact.id}
              onClick={() => onSelectContact(contact.id)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #374151',
                cursor: 'pointer',
                background: selectedContactId === contact.id ? '#374151' : 'transparent',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                if (selectedContactId !== contact.id) {
                  e.currentTarget.style.background = '#2d3748';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedContactId !== contact.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Avatar */}
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: contact.avatar ? `url(${contact.avatar})` : '#4b5563',
                      backgroundSize: 'cover',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f9fafb',
                      fontWeight: '600',
                    }}
                  >
                    {!contact.avatar && contact.name.charAt(0).toUpperCase()}
                  </div>
                  {/* Status indicator */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '0',
                      right: '0',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: getStatusColor(contact.status),
                      border: '2px solid #1f2937',
                    }}
                  />
                </div>

                {/* Contact Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        color: '#f9fafb',
                        fontWeight: '500',
                        fontSize: '14px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {contact.name}
                    </span>
                    {contact.isPinned && (
                      <span style={{ color: '#f59e0b', fontSize: '12px' }}>📌</span>
                    )}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '12px' }}>
                    {formatLastSeen(contact.lastSeen)}
                  </div>
                </div>

                {/* Unread badge */}
                {contact.unreadCount > 0 && (
                  <div
                    style={{
                      background: '#10b981',
                      color: 'white',
                      borderRadius: '12px',
                      padding: '2px 8px',
                      fontSize: '12px',
                      fontWeight: '600',
                      minWidth: '20px',
                      textAlign: 'center',
                    }}
                  >
                    {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #374151',
          color: '#9ca3af',
          fontSize: '12px',
        }}
      >
        {filteredAndSortedContacts.length} of {contacts.length} contacts
      </div>
    </div>
  );
};
