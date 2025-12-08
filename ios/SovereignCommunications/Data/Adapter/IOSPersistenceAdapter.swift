//
//  IOSPersistenceAdapter.swift
//  SovereignCommunications
//
//  Created by SC Platform Team on 2025-12-08.
//  Purpose: iOS implementation of PersistenceAdapter for @sc/core
//

import Foundation
import CoreData
import os.log

/**
 * iOS implementation of PersistenceAdapter for @sc/core
 * Uses CoreData for persistent storage of queued messages
 *
 * This adapter bridges the gap between the core library's MessageRelay
 * and iOS's CoreData persistence layer, enabling true "sneakernet" capability.
 */
class IOSPersistenceAdapter {
    
    private let context: NSManagedObjectContext
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "IOSPersistenceAdapter")
    
    // Cache for quick lookups
    private var messageCache: [String: StoredMessage] = [:]
    private let cacheQueue = DispatchQueue(label: "com.sc.persistence.cache", attributes: .concurrent)
    
    /**
     * StoredMessage structure matching core library interface
     */
    struct StoredMessage {
        let destinationPeerId: String
        let payload: Data
        let attempts: Int
        let lastAttempt: Date
        let expiresAt: Date
        let priority: Int
        let messageId: String
        
        init(destinationPeerId: String,
             payload: Data,
             attempts: Int = 0,
             lastAttempt: Date = Date(),
             expiresAt: Date = Date().addingTimeInterval(86400), // 24 hours default
             priority: Int = 1,
             messageId: String) {
            self.destinationPeerId = destinationPeerId
            self.payload = payload
            self.attempts = attempts
            self.lastAttempt = lastAttempt
            self.expiresAt = expiresAt
            self.priority = priority
            self.messageId = messageId
        }
    }
    
    init(context: NSManagedObjectContext = CoreDataStack.shared.viewContext) {
        self.context = context
    }
    
    // MARK: - PersistenceAdapter Methods
    
    /**
     * Save a message to persistent storage
     * Called by core library when message delivery fails
     */
    func saveMessage(id: String, message: StoredMessage) async {
        await context.perform {
            let entity = MessageEntity(context: self.context)
            entity.id = id
            entity.conversationId = message.destinationPeerId
            entity.senderId = UserDefaults.standard.string(forKey: "localPeerId") ?? "me"
            entity.content = String(data: message.payload, encoding: .utf8) ?? "[Binary Data]"
            entity.timestamp = Date()
            entity.status = "queued"
            entity.isEncrypted = true
            
            // Store metadata
            let metadata: [String: Any] = [
                "attempts": message.attempts,
                "lastAttempt": message.lastAttempt.timeIntervalSince1970,
                "expiresAt": message.expiresAt.timeIntervalSince1970,
                "priority": message.priority
            ]
            
            if let jsonData = try? JSONSerialization.data(withJSONObject: metadata),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                entity.metadata = jsonString
            }
            
            CoreDataStack.shared.save(context: self.context)
            
            // Update cache
            self.cacheQueue.async(flags: .barrier) {
                self.messageCache[id] = message
            }
            
            self.logger.info("Saved message \(id) to persistence")
        }
    }
    
    /**
     * Retrieve a specific message by ID
     */
    func getMessage(id: String) async -> StoredMessage? {
        // Check cache first
        let cached = cacheQueue.sync { messageCache[id] }
        if let cached = cached {
            return cached
        }
        
        // Load from CoreData
        return await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", id)
            fetchRequest.fetchLimit = 1
            
            guard let entity = try? self.context.fetch(fetchRequest).first else {
                return nil
            }
            
            // Parse metadata
            var attempts = 0
            var lastAttempt = Date()
            var expiresAt = Date().addingTimeInterval(86400)
            var priority = 1
            
            if let metadataString = entity.metadata,
               let metadataData = metadataString.data(using: .utf8),
               let metadata = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {
                attempts = metadata["attempts"] as? Int ?? 0
                if let lastAttemptTimestamp = metadata["lastAttempt"] as? TimeInterval {
                    lastAttempt = Date(timeIntervalSince1970: lastAttemptTimestamp)
                }
                if let expiresAtTimestamp = metadata["expiresAt"] as? TimeInterval {
                    expiresAt = Date(timeIntervalSince1970: expiresAtTimestamp)
                }
                priority = metadata["priority"] as? Int ?? 1
            }
            
            let message = StoredMessage(
                destinationPeerId: entity.conversationId,
                payload: entity.content.data(using: .utf8) ?? Data(),
                attempts: attempts,
                lastAttempt: lastAttempt,
                expiresAt: expiresAt,
                priority: priority,
                messageId: id
            )
            
            // Update cache
            self.cacheQueue.async(flags: .barrier) {
                self.messageCache[id] = message
            }
            
            return message
        }
    }
    
    /**
     * Remove a message from storage
     * Called when message is successfully delivered or expires
     */
    func removeMessage(id: String) async {
        await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", id)
            
            if let entity = try? self.context.fetch(fetchRequest).first {
                self.context.delete(entity)
                CoreDataStack.shared.save(context: self.context)
                
                self.logger.info("Removed message \(id) from persistence")
            }
            
            // Remove from cache
            self.cacheQueue.async(flags: .barrier) {
                self.messageCache.removeValue(forKey: id)
            }
        }
    }
    
    /**
     * Get all stored messages for retry
     * Used by store-and-forward mechanism
     */
    func getAllMessages() async -> [String: StoredMessage] {
        return await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "status == %@", "queued")
            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]
            
            guard let entities = try? self.context.fetch(fetchRequest) else {
                return [:]
            }
            
            var messages: [String: StoredMessage] = [:]
            
            for entity in entities {
                guard let id = entity.id else { continue }
                
                var attempts = 0
                var lastAttempt = Date()
                var expiresAt = Date().addingTimeInterval(86400)
                var priority = 1
                
                if let metadataString = entity.metadata,
                   let metadataData = metadataString.data(using: .utf8),
                   let metadata = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {
                    attempts = metadata["attempts"] as? Int ?? 0
                    if let lastAttemptTimestamp = metadata["lastAttempt"] as? TimeInterval {
                        lastAttempt = Date(timeIntervalSince1970: lastAttemptTimestamp)
                    }
                    if let expiresAtTimestamp = metadata["expiresAt"] as? TimeInterval {
                        expiresAt = Date(timeIntervalSince1970: expiresAtTimestamp)
                    }
                    priority = metadata["priority"] as? Int ?? 1
                }
                
                let message = StoredMessage(
                    destinationPeerId: entity.conversationId,
                    payload: entity.content.data(using: .utf8) ?? Data(),
                    attempts: attempts,
                    lastAttempt: lastAttempt,
                    expiresAt: expiresAt,
                    priority: priority,
                    messageId: id
                )
                
                messages[id] = message
            }
            
            // Update cache
            self.cacheQueue.async(flags: .barrier) {
                self.messageCache = messages
            }
            
            self.logger.info("Loaded \(messages.count) queued messages from persistence")
            
            return messages
        }
    }
    
    /**
     * Remove expired messages
     * Called periodically to clean up old queued messages
     */
    func pruneExpired(now: Date) async {
        await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "status == %@", "queued")
            
            guard let entities = try? self.context.fetch(fetchRequest) else {
                return
            }
            
            var deletedCount = 0
            
            for entity in entities {
                guard let metadataString = entity.metadata,
                      let metadataData = metadataString.data(using: .utf8),
                      let metadata = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any],
                      let expiresAtTimestamp = metadata["expiresAt"] as? TimeInterval else {
                    continue
                }
                
                let expiresAt = Date(timeIntervalSince1970: expiresAtTimestamp)
                
                if expiresAt < now {
                    if let id = entity.id {
                        self.cacheQueue.async(flags: .barrier) {
                            self.messageCache.removeValue(forKey: id)
                        }
                    }
                    self.context.delete(entity)
                    deletedCount += 1
                }
            }
            
            if deletedCount > 0 {
                CoreDataStack.shared.save(context: self.context)
                self.logger.info("Pruned \(deletedCount) expired messages")
            }
        }
    }
    
    /**
     * Get count of stored messages
     */
    func size() async -> Int {
        return await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "status == %@", "queued")
            
            return (try? self.context.count(for: fetchRequest)) ?? 0
        }
    }
    
    /**
     * Update message metadata after delivery attempt
     */
    func updateMessage(id: String, attempts: Int, lastAttempt: Date, success: Bool) async {
        await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", id)
            
            guard let entity = try? self.context.fetch(fetchRequest).first else {
                return
            }
            
            // Parse existing metadata
            var metadata: [String: Any] = [:]
            if let metadataString = entity.metadata,
               let metadataData = metadataString.data(using: .utf8),
               let existing = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any] {
                metadata = existing
            }
            
            // Update metadata
            metadata["attempts"] = attempts
            metadata["lastAttempt"] = lastAttempt.timeIntervalSince1970
            
            // Save updated metadata
            if let jsonData = try? JSONSerialization.data(withJSONObject: metadata),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                entity.metadata = jsonString
            }
            
            // Update status
            entity.status = success ? "sent" : "queued"
            
            CoreDataStack.shared.save(context: self.context)
            
            // Remove from cache if successful
            if success {
                self.cacheQueue.async(flags: .barrier) {
                    self.messageCache.removeValue(forKey: id)
                }
            }
            
            self.logger.info("Updated message \(id): attempts=\(attempts), success=\(success)")
        }
    }
}
