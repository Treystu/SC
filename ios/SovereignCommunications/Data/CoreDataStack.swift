import CoreData
import os.log

/// Core Data stack with encryption, migration, and iCloud sync support
class CoreDataStack {
    static let shared = CoreDataStack()
    
    let container: NSPersistentContainer
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "CoreData")
    
    /// Main view context for UI operations
    var viewContext: NSManagedObjectContext {
        container.viewContext
    }
    
    private init() {
        // Use NSPersistentCloudKitContainer for iCloud sync support
        container = NSPersistentCloudKitContainer(name: "SovereignCommunications")
        
        // Configure persistent store with encryption and options
        configurePersistentStore()
        
        // Load persistent stores
        container.loadPersistentStores { [weak self] description, error in
            if let error = error {
                self?.logger.error("Unable to load persistent stores: \(error.localizedDescription)")
                fatalError("Unable to load persistent stores: \(error)")
            }
            
            self?.logger.info("Loaded persistent store: \(description.url?.lastPathComponent ?? "unknown")")
        }
        
        // Configure view context
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        
        // Enable query generation for consistent snapshots
        do {
            try container.viewContext.setQueryGenerationFrom(.current)
        } catch {
            logger.warning("Failed to pin view context to current query generation: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Persistent Store Configuration
    
    private func configurePersistentStore() {
        guard let description = container.persistentStoreDescriptions.first else {
            return
        }
        
        // Enable persistent history tracking for iCloud sync
        description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
        description.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)
        
        // Enable file protection for encryption at rest
        description.setOption(FileProtectionType.completeUnlessOpen as NSObject,
                            forKey: NSPersistentStoreFileProtectionKey)
        
        // Enable lightweight migration
        description.shouldMigrateStoreAutomatically = true
        description.shouldInferMappingModelAutomatically = true
        
        // Configure iCloud sync (can be disabled via user settings)
        if UserDefaults.standard.bool(forKey: "enableiCloudSync") {
            description.cloudKitContainerOptions = NSPersistentCloudKitContainerOptions(
                containerIdentifier: "iCloud.com.sovereign.communications"
            )
            logger.info("iCloud sync enabled")
        } else {
            description.cloudKitContainerOptions = nil
            logger.info("iCloud sync disabled")
        }
    }
    
    // MARK: - Context Management
    
    /// Create a background context for batch operations
    func newBackgroundContext() -> NSManagedObjectContext {
        let context = container.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        return context
    }
    
    /// Perform operations on a background context
    func performBackgroundTask(_ block: @escaping (NSManagedObjectContext) -> Void) {
        container.performBackgroundTask(block)
    }
    
    // MARK: - Save Operations
    
    /// Save the main view context
    func save() {
        save(context: viewContext)
    }
    
    /// Save a specific context
    func save(context: NSManagedObjectContext) {
        guard context.hasChanges else { return }
        
        context.perform {
            do {
                try context.save()
                self.logger.debug("Context saved successfully")
            } catch {
                self.logger.error("Error saving context: \(error.localizedDescription)")
                // Don't crash in production, just log the error
                #if DEBUG
                fatalError("Error saving context: \(error)")
                #endif
            }
        }
    }
    
    // MARK: - Migration Support
    
    /// Check if migration is needed
    func requiresMigration() -> Bool {
        guard let storeURL = container.persistentStoreDescriptions.first?.url else {
            return false
        }
        
        guard let metadata = try? NSPersistentStoreCoordinator.metadataForPersistentStore(
            ofType: NSSQLiteStoreType,
            at: storeURL
        ) else {
            return false
        }
        
        let model = container.managedObjectModel
        return !model.isConfiguration(withName: nil, compatibleWithStoreMetadata: metadata)
    }
    
    // MARK: - Performance Monitoring
    
    /// Get statistics about the persistent store
    func getStoreStatistics() -> [String: Any] {
        var stats: [String: Any] = [:]
        
        if let storeURL = container.persistentStoreDescriptions.first?.url {
            stats["storeURL"] = storeURL.path
            
            if let fileSize = try? FileManager.default.attributesOfItem(atPath: storeURL.path)[.size] as? Int {
                stats["fileSize"] = fileSize
            }
        }
        
        return stats
    }
    
    // MARK: - Batch Operations
    
    /// Execute a batch delete request
    func batchDelete(fetchRequest: NSFetchRequest<NSFetchRequestResult>) throws {
        let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)
        deleteRequest.resultType = .resultTypeObjectIDs
        
        let result = try viewContext.execute(deleteRequest) as? NSBatchDeleteResult
        
        if let objectIDs = result?.result as? [NSManagedObjectID] {
            NSManagedObjectContext.mergeChanges(
                fromRemoteContextSave: [NSDeletedObjectsKey: objectIDs],
                into: [viewContext]
            )
        }
    }
    
    // MARK: - iCloud Sync
    
    /// Enable or disable iCloud sync
    func setCloudSyncEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: "enableiCloudSync")
        logger.info("iCloud sync \(enabled ? "enabled" : "disabled")")
        
        // Note: Requires app restart to take effect
        // In production, you might want to recreate the persistent store
    }
}
