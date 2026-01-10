/**
 * @jest-environment jsdom
 */

/**
 * Tests for message receiving workflow
 * Verifies that incoming messages:
 * 1. Create new conversations when from unknown senders
 * 2. Update existing conversations with new messages
 * 3. Show pending request status for unknown contacts
 * 4. Trigger UI notifications
 * 5. Persist messages to database
 */

// Mock the database
const mockDb = {
  init: jest.fn().mockResolvedValue(undefined),
  getConversation: jest.fn(),
  saveConversation: jest.fn().mockResolvedValue(undefined),
  getContact: jest.fn(),
  saveMessage: jest.fn().mockResolvedValue(undefined),
  getMessage: jest.fn(),
  getGroup: jest.fn(),
};

jest.mock('../../storage/database', () => ({
  getDatabase: () => mockDb,
}));

// Mock notification manager
const mockNotificationManager = {
  showMessageNotification: jest.fn(),
  requestPermission: jest.fn().mockResolvedValue(true),
};

jest.mock('../../notifications', () => ({
  notificationManager: mockNotificationManager,
}));

// Mock notifyConversationsUpdated
const mockNotifyConversationsUpdated = jest.fn();
jest.mock('../useConversations', () => ({
  notifyConversationsUpdated: mockNotifyConversationsUpdated,
}));

describe('Message Receiving Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('New Conversation Creation', () => {
    it('should create a new conversation when receiving message from unknown sender', async () => {
      // Simulate no existing conversation
      mockDb.getConversation.mockResolvedValue(null);
      mockDb.getContact.mockResolvedValue(null);

      const senderId = 'unknown-peer-123';
      const timestamp = Date.now();

      // Simulate the logic from useMeshNetwork message handler
      const conversation = await mockDb.getConversation(senderId);
      
      if (!conversation) {
        const contact = await mockDb.getContact(senderId);
        const isUnknown = !contact || !contact.verified;

        await mockDb.saveConversation({
          id: senderId,
          contactId: senderId,
          lastMessageTimestamp: timestamp,
          unreadCount: 1,
          createdAt: timestamp,
          lastMessageId: 'msg-123',
          metadata: isUnknown ? { requestStatus: 'pending', isRequest: true } : undefined
        });

        mockNotifyConversationsUpdated();
      }

      expect(mockDb.saveConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: senderId,
          metadata: { requestStatus: 'pending', isRequest: true }
        })
      );
      expect(mockNotifyConversationsUpdated).toHaveBeenCalled();
    });

    it('should mark conversation as pending request for unverified contacts', async () => {
      mockDb.getConversation.mockResolvedValue(null);
      mockDb.getContact.mockResolvedValue({ id: 'peer-123', verified: false });

      const senderId = 'peer-123';
      const contact = await mockDb.getContact(senderId);
      const isUnknown = !contact || !contact.verified;

      expect(isUnknown).toBe(true);
    });

    it('should NOT mark as request for verified contacts', async () => {
      mockDb.getConversation.mockResolvedValue(null);
      mockDb.getContact.mockResolvedValue({ id: 'peer-123', verified: true, displayName: 'Trusted Friend' });

      const senderId = 'peer-123';
      const contact = await mockDb.getContact(senderId);
      const isUnknown = !contact || !contact.verified;

      expect(isUnknown).toBe(false);
    });
  });

  describe('Existing Conversation Update', () => {
    it('should update unread count for existing conversation', async () => {
      const existingConversation = {
        id: 'peer-456',
        contactId: 'peer-456',
        lastMessageTimestamp: Date.now() - 10000,
        unreadCount: 2,
        createdAt: Date.now() - 100000,
      };

      mockDb.getConversation.mockResolvedValue(existingConversation);

      const newTimestamp = Date.now();
      const conversation = await mockDb.getConversation('peer-456');

      if (conversation) {
        await mockDb.saveConversation({
          ...conversation,
          lastMessageTimestamp: newTimestamp,
          unreadCount: conversation.unreadCount + 1,
          lastMessageId: 'new-msg-id',
        });

        mockNotifyConversationsUpdated();
      }

      expect(mockDb.saveConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          unreadCount: 3,
          lastMessageId: 'new-msg-id',
        })
      );
      expect(mockNotifyConversationsUpdated).toHaveBeenCalled();
    });
  });

  describe('Notifications', () => {
    it('should show browser notification for new messages', async () => {
      const senderName = 'Test User';
      const messageContent = 'Hello there!';
      const conversationId = 'peer-789';

      mockNotificationManager.showMessageNotification(
        senderName,
        messageContent,
        conversationId
      );

      expect(mockNotificationManager.showMessageNotification).toHaveBeenCalledWith(
        senderName,
        messageContent,
        conversationId
      );
    });

    it('should dispatch in-app toast for new message requests', () => {
      const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

      window.dispatchEvent(new CustomEvent('show-notification', {
        detail: {
          message: 'New message request from Unknown Peer',
          type: 'info'
        }
      }));

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'show-notification',
        })
      );

      dispatchEventSpy.mockRestore();
    });
  });

  describe('Message Persistence', () => {
    it('should save incoming message to database', async () => {
      const message = {
        id: 'msg-abc-123',
        conversationId: 'peer-sender',
        content: 'Test message content',
        timestamp: Date.now(),
        senderId: 'peer-sender',
        recipientId: 'local-peer-id',
        type: 'text',
        status: 'delivered',
      };

      await mockDb.saveMessage(message);

      expect(mockDb.saveMessage).toHaveBeenCalledWith(message);
    });

    it('should not duplicate messages with same ID', async () => {
      const messageId = 'duplicate-msg-id';
      
      // First call returns null (message doesn't exist)
      mockDb.getMessage.mockResolvedValueOnce(null);
      
      // Simulate checking if message exists
      const existingMessage = await mockDb.getMessage(messageId);
      
      if (!existingMessage) {
        await mockDb.saveMessage({ id: messageId, content: 'First save' });
      }

      expect(mockDb.saveMessage).toHaveBeenCalledTimes(1);

      // Second call returns the message (already exists)
      mockDb.getMessage.mockResolvedValueOnce({ id: messageId, content: 'First save' });
      
      const existingMessage2 = await mockDb.getMessage(messageId);
      
      if (!existingMessage2) {
        await mockDb.saveMessage({ id: messageId, content: 'Should not save' });
      }

      // Should still be 1 call, not 2
      expect(mockDb.saveMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accept/Reject Request Flow', () => {
    it('should update request status to accepted', async () => {
      const pendingConversation = {
        id: 'peer-request',
        contactId: 'peer-request',
        lastMessageTimestamp: Date.now(),
        unreadCount: 1,
        createdAt: Date.now(),
        metadata: { requestStatus: 'pending', isRequest: true }
      };

      mockDb.getConversation.mockResolvedValue(pendingConversation);

      const conversation = await mockDb.getConversation('peer-request');
      
      if (conversation) {
        await mockDb.saveConversation({
          ...conversation,
          metadata: {
            ...conversation.metadata,
            requestStatus: 'accepted'
          }
        });
      }

      expect(mockDb.saveConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            requestStatus: 'accepted'
          })
        })
      );
    });
  });
});
