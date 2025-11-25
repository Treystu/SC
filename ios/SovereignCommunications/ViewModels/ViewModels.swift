//
//  ConversationListViewModel.swift
//  Sovereign Communications
//
//  SwiftUI ViewModel for conversation list with proper state management
//

import Foundation
import SwiftUI
import CoreData
import Combine
import os.log

/// ViewModel for conversation list with reactive state management
@MainActor
class ConversationListViewModel: ObservableObject {
    @Published var conversations: [ConversationEntity] = []
    @Published var searchText: String = ""
    @Published var isLoading: Bool = false
    @Published var error: String?
    
    private let context: NSManagedObjectContext
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "ConversationList")
    
    private var cancellables = Set<AnyCancellable>()
    
    init(context: NSManagedObjectContext = CoreDataStack.shared.viewContext) {
        self.context = context
        setupObservers()
        loadConversations()
    }
    
    // MARK: - Setup
    
    private func setupObservers() {
        // Observe search text changes
        $searchText
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.loadConversations()
            }
            .store(in: &cancellables)
        
        // Observe Core Data changes
        NotificationCenter.default.publisher(for: .NSManagedObjectContextObjectsDidChange, object: context)
            .sink { [weak self] _ in
                self?.loadConversations()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Data Loading
    
    func loadConversations() {
        isLoading = true
        error = nil
        
        let request = ConversationEntity.fetchRequest()
        
        // Apply search filter
        if !searchText.isEmpty {
            request.predicate = NSPredicate(
                format: "contact.displayName CONTAINS[cd] %@ OR lastMessage CONTAINS[cd] %@",
                searchText, searchText
            )
        }
        
        // Sort by pinned status, then by last message timestamp
        request.sortDescriptors = [
            NSSortDescriptor(keyPath: \ConversationEntity.isPinned, ascending: false),
            NSSortDescriptor(keyPath: \ConversationEntity.lastMessageTimestamp, ascending: false)
        ]
        
        do {
            conversations = try context.fetch(request)
            logger.debug("Loaded \(self.conversations.count) conversations")
        } catch {
            logger.error("Failed to load conversations: \(error.localizedDescription)")
            self.error = "Failed to load conversations"
        }
        
        isLoading = false
    }
    
    // MARK: - Actions
    
    func togglePin(conversation: ConversationEntity) {
        conversation.isPinned.toggle()
        CoreDataStack.shared.save(context: context)
        logger.info("Toggled pin for conversation: \(conversation.id ?? "unknown")")
    }
    
    func markAsRead(conversation: ConversationEntity) {
        conversation.unreadCount = 0
        CoreDataStack.shared.save(context: context)
        
        // Update badge count
        updateBadgeCount()
        
        logger.info("Marked conversation as read: \(conversation.id ?? "unknown")")
    }
    
    func deleteConversation(conversation: ConversationEntity) {
        context.delete(conversation)
        CoreDataStack.shared.save(context: context)
        
        // Update badge count
        updateBadgeCount()
        
        logger.info("Deleted conversation: \(conversation.id ?? "unknown")")
    }
    
    func updateBadgeCount() {
        let totalUnread = conversations.reduce(0) { $0 + Int($1.unreadCount) }
        NotificationManager.shared.updateBadgeCount(totalUnread)
    }
    
    // MARK: - Computed Properties
    
    var filteredConversations: [ConversationEntity] {
        if searchText.isEmpty {
            return conversations
        }
        return conversations // Already filtered by fetch request
    }
    
    var pinnedConversations: [ConversationEntity] {
        conversations.filter { $0.isPinned }
    }
    
    var unpinnedConversations: [ConversationEntity] {
        conversations.filter { !$0.isPinned }
    }
}

// MARK: - Chat ViewModel

@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [MessageEntity] = []
    @Published var messageText: String = ""
    @Published var isLoading: Bool = false
    @Published var isSending: Bool = false
    @Published var error: String?
    
    let conversation: ConversationEntity
    private let context: NSManagedObjectContext
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "Chat")
    
    private var cancellables = Set<AnyCancellable>()
    
    init(conversation: ConversationEntity, context: NSManagedObjectContext = CoreDataStack.shared.viewContext) {
        self.conversation = conversation
        self.context = context
        loadMessages()
        setupObservers()
    }
    
    // MARK: - Setup
    
    private func setupObservers() {
        // Observe Core Data changes
        NotificationCenter.default.publisher(for: .NSManagedObjectContextObjectsDidChange, object: context)
            .sink { [weak self] _ in
                self?.loadMessages()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Data Loading
    
    func loadMessages() {
        isLoading = true
        error = nil
        
        let request = MessageEntity.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@", conversation.id ?? "")
        request.sortDescriptors = [NSSortDescriptor(keyPath: \MessageEntity.timestamp, ascending: true)]
        
        do {
            messages = try context.fetch(request)
            logger.debug("Loaded \(self.messages.count) messages")
        } catch {
            logger.error("Failed to load messages: \(error.localizedDescription)")
            self.error = "Failed to load messages"
        }
        
        isLoading = false
    }
    
    // MARK: - Actions
    
    func sendMessage() {
        guard !messageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }
        
        isSending = true
        
        // Create new message
        let message = MessageEntity(context: context)
        message.id = UUID().uuidString
        message.conversationId = conversation.id ?? ""
        message.senderId = UserDefaults.standard.string(forKey: "localPeerId") ?? ""
        message.content = messageText
        message.timestamp = Date()
        message.status = "pending"
        message.isEncrypted = true
        
        // Update conversation
        conversation.lastMessage = messageText
        conversation.lastMessageTimestamp = message.timestamp
        
        // Save to Core Data
        CoreDataStack.shared.save(context: context)
        
        // Send through mesh network
        MeshNetworkManager.shared.sendMessage(recipientId: conversation.contact.id, message: messageText)
        
        // Update UI
        self.isSending = false
        self.messageText = ""
        
        logger.info("Sent message: \(message.id ?? "unknown")")
    }
    
    func deleteMessage(_ message: MessageEntity) {
        context.delete(message)
        CoreDataStack.shared.save(context: context)
        logger.info("Deleted message: \(message.id ?? "unknown")")
    }
}

// MARK: - Contact List ViewModel

@MainActor
class ContactListViewModel: ObservableObject {
    @Published var contacts: [ContactEntity] = []
    @Published var searchText: String = ""
    @Published var isLoading: Bool = false
    @Published var error: String?
    
    private let context: NSManagedObjectContext
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "ContactList")
    
    private var cancellables = Set<AnyCancellable>()
    
    init(context: NSManagedObjectContext = CoreDataStack.shared.viewContext) {
        self.context = context
        setupObservers()
        loadContacts()
    }
    
    // MARK: - Setup
    
    private func setupObservers() {
        // Observe search text changes
        $searchText
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                self?.loadContacts()
            }
            .store(in: &cancellables)
        
        // Observe Core Data changes
        NotificationCenter.default.publisher(for: .NSManagedObjectContextObjectsDidChange, object: context)
            .sink { [weak self] _ in
                self?.loadContacts()
            }
            .store(in: &cancellables)
    }
    
    // MARK: - Data Loading
    
    func loadContacts() {
        isLoading = true
        error = nil
        
        let request = ContactEntity.fetchRequest()
        
        // Apply search filter
        if !searchText.isEmpty {
            request.predicate = NSPredicate(
                format: "displayName CONTAINS[cd] %@ OR id CONTAINS[cd] %@",
                searchText, searchText
            )
        }
        
        // Sort by favorites, then by display name
        request.sortDescriptors = [
            NSSortDescriptor(keyPath: \ContactEntity.isFavorite, ascending: false),
            NSSortDescriptor(keyPath: \ContactEntity.displayName, ascending: true)
        ]
        
        do {
            contacts = try context.fetch(request)
            logger.debug("Loaded \(self.contacts.count) contacts")
        } catch {
            logger.error("Failed to load contacts: \(error.localizedDescription)")
            self.error = "Failed to load contacts"
        }
        
        isLoading = false
    }
    
    // MARK: - Actions
    
    func toggleFavorite(contact: ContactEntity) {
        contact.isFavorite.toggle()
        CoreDataStack.shared.save(context: context)
        logger.info("Toggled favorite for contact: \(contact.id ?? "unknown")")
    }
    
    func toggleVerified(contact: ContactEntity) {
        contact.isVerified.toggle()
        CoreDataStack.shared.save(context: context)
        logger.info("Toggled verified for contact: \(contact.id ?? "unknown")")
    }
    
    func deleteContact(contact: ContactEntity) {
        context.delete(contact)
        CoreDataStack.shared.save(context: context)
        logger.info("Deleted contact: \(contact.id ?? "unknown")")
    }
    
    // MARK: - Computed Properties
    
    var favoriteContacts: [ContactEntity] {
        contacts.filter { $0.isFavorite }
    }
    
    var regularContacts: [ContactEntity] {
        contacts.filter { !$0.isFavorite }
    }
}
