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
 * and iOS's CoreData persistence layer.
 * 
 * Payload Storage Strategy:
 * - Raw message stored in metadata as Base64-encoded bytes
 * - Content field stores human-readable preview for UI
 * - Sender ID extracted from message.header.senderId (Ed25519 public key)
 * - Only QUEUED/RELAY messages deleted on delivery
 * - Conversation history messages preserved separately
 */
class IOSPersistenceAdapter {
    
    private let context: NSManagedObjectContext
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "IOSPersistenceAdapter")
    
    // Cache for quick lookups
    private var messageCache: [String: CoreStoredMessage] = [:]
    private let cacheQueue = DispatchQueue(label: "com.sc.persistence.cache", attributes: .concurrent)
    
    // Constants for unification
    private static let DEFAULT_MESSAGE_EXPIRATION_SECONDS: TimeInterval = 86400 // 24 hours in seconds
    
    /**
     * Core library's StoredMessage structure
     * Contains the complete Message with header and binary payload
     */
    struct CoreStoredMessage {
        let message: CoreMessage
        let destinationPeerId: String
        let attempts: Int
        let lastAttempt: Date
        let expiresAt: Date
    }
    
    /**
     * Core Message structure (matches @sc/core)
     */
    struct CoreMessage {
        let header: MessageHeader
        let payload: Data
    }
    
    struct MessageHeader {
        let version: UInt8
        let type: UInt8
        let ttl: UInt8
        let timestamp: UInt64
        let senderId: Data // Ed25519 public key (32 bytes)
        let signature: Data // Ed25519 signature (64 bytes)
    }
    
    init(context: NSManagedObjectContext = CoreDataStack.shared.viewContext) {
        self.context = context
    }
    
    // MARK: - PersistenceAdapter Methods
    
    /**
     * Save a message to persistent storage
     * Called by core library when message delivery fails
     */
    func saveMessage(id: String, message: CoreStoredMessage) async {
        await context.perform {
            let entity = MessageEntity(context: self.context)
            entity.id = id
            entity.conversationId = message.destinationPeerId
            
            // Extract sender ID from message header (Ed25519 public key) - Base64 encoding
            let senderIdBase64 = message.message.header.senderId.base64EncodedString()
            entity.senderId = senderIdBase64
            
            // Create human-readable preview for UI
            var preview: String
            if let payloadString = String(data: message.message.payload.prefix(100), encoding: .utf8) {
                let truncated = String(payloadString.prefix(50))
                preview = truncated
                if payloadString.count > 50 {
                    preview += "..."
                }
            } else {
                preview = "[Binary Data: \(message.message.payload.count) bytes]"
            }
            entity.content = preview
            
            entity.timestamp = Date(timeIntervalSince1970: TimeInterval(message.message.header.timestamp) / 1000.0)
            entity.status = "queued"
            entity.isEncrypted = true
            
            // Serialize the complete message for secure storage
            let messageBytes = self.serializeMessage(message.message)
            let messageBase64 = messageBytes.base64EncodedString()
            
            // Store metadata
            let metadata: [String: Any] = [
                "attempts": message.attempts,
                "lastAttempt": message.lastAttempt.timeIntervalSince1970,
                "expiresAt": message.expiresAt.timeIntervalSince1970,
                "rawMessage": messageBase64,
                "payloadSize": message.message.payload.count
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
    func getMessage(id: String) async -> CoreStoredMessage? {
        // Check cache first
        let cached = cacheQueue.sync { messageCache[id] }
        if let cached = cached {
            return cached
        }
        
        // Load from CoreData
        return await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@ AND status == %@", id, "queued")
            fetchRequest.fetchLimit = 1
            
            guard let entity = try? self.context.fetch(fetchRequest).first else {
                return nil
            }
            
            let message = self.deserializeStoredMessage(entity: entity)
            
            // Update cache
            if let message = message {
                self.cacheQueue.async(flags: .barrier) {
                    self.messageCache[id] = message
                }
            }
            
            return message
        }
    }
    
    /**
     * Remove a message from storage
     * Called when message is successfully delivered or expires
     * Only deletes queued/relay messages - conversation history preserved separately
     */
    func removeMessage(id: String) async {
        await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", id)
            
            if let entity = try? self.context.fetch(fetchRequest).first {
                self.context.delete(entity)
                CoreDataStack.shared.save(context: self.context)
                
                self.logger.info("Deleted queued/relay message \(id)")
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
    func getAllMessages() async -> [String: CoreStoredMessage] {
        return await context.perform {
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "status == %@", "queued")
            fetchRequest.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: true)]
            
            guard let entities = try? self.context.fetch(fetchRequest) else {
                return [:]
            }
            
            var messages: [String: CoreStoredMessage] = [:]
            
            for entity in entities {
                guard let id = entity.id,
                      let message = self.deserializeStoredMessage(entity: entity) else {
                    continue
                }
                
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
    
    // MARK: - Serialization Helpers
    
    /**
     * Serialize a message to bytes (unified format)
     */
    private func serializeMessage(_ message: CoreMessage) -> Data {
        var data = Data()
        
        // Version (1 byte)
        data.append(message.header.version)
        // Type (1 byte)
        data.append(message.header.type)
        // TTL (1 byte)
        data.append(message.header.ttl)
        // Timestamp (8 bytes, big-endian)
        var timestamp = message.header.timestamp.bigEndian
        data.append(Data(bytes: &timestamp, count: 8))
        // SenderId (32 bytes)
        data.append(message.header.senderId)
        // Signature (64 bytes)
        data.append(message.header.signature)
        // Payload (variable)
        data.append(message.payload)
        
        return data
    }
    
    /**
     * Deserialize StoredMessage from database entity
     */
    private func deserializeStoredMessage(entity: MessageEntity) -> CoreStoredMessage? {
        guard let metadataString = entity.metadata,
              let metadataData = metadataString.data(using: .utf8),
              let metadata = try? JSONSerialization.jsonObject(with: metadataData) as? [String: Any],
              let messageBase64 = metadata["rawMessage"] as? String,
              let messageBytes = Data(base64Encoded: messageBase64) else {
            return nil
        }
        
        guard let message = deserializeMessage(messageBytes) else {
            return nil
        }
        
        let attempts = metadata["attempts"] as? Int ?? 0
        let lastAttemptTimestamp = metadata["lastAttempt"] as? TimeInterval ?? Date().timeIntervalSince1970
        let expiresAtTimestamp = metadata["expiresAt"] as? TimeInterval ?? (Date().timeIntervalSince1970 + IOSPersistenceAdapter.DEFAULT_MESSAGE_EXPIRATION_MS)
        
        return CoreStoredMessage(
            message: message,
            destinationPeerId: entity.conversationId,
            attempts: attempts,
            lastAttempt: Date(timeIntervalSince1970: lastAttemptTimestamp),
            expiresAt: Date(timeIntervalSince1970: expiresAtTimestamp)
        )
    }
    
    /**
     * Deserialize message from bytes
     */
    private func deserializeMessage(_ data: Data) -> CoreMessage? {
        guard data.count >= 108 else { return nil } // Minimum header size
        
        var offset = 0
        
        // Version (1 byte)
        let version = data[offset]
        offset += 1
        // Type (1 byte)
        let type = data[offset]
        offset += 1
        // TTL (1 byte)
        let ttl = data[offset]
        offset += 1
        // Timestamp (8 bytes, big-endian)
        let timestamp = data.subdata(in: offset..<offset+8).withUnsafeBytes { $0.load(as: UInt64.self).bigEndian }
        offset += 8
        // SenderId (32 bytes)
        let senderId = data.subdata(in: offset..<offset+32)
        offset += 32
        // Signature (64 bytes)
        let signature = data.subdata(in: offset..<offset+64)
        offset += 64
        // Payload (rest)
        let payload = data.subdata(in: offset..<data.count)
        
        return CoreMessage(
            header: MessageHeader(
                version: version,
                type: type,
                ttl: ttl,
                timestamp: timestamp,
                senderId: senderId,
                signature: signature
            ),
            payload: payload
        )
    }
}
