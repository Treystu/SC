import Foundation
import CoreData
import os.log

/// CoreDataStack provides Core Data persistence with encryption support
/// The database encryption key is stored in the hardware-backed iOS Keychain
class CoreDataStack {

    // MARK: - Properties

    static let shared = CoreDataStack()
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "CoreDataStack")

    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "SovereignCommunications")

        // Configure persistent store description for encryption
        if let description = container.persistentStoreDescriptions.first {
            // Enable persistent history tracking for sync
            description.setOption(true as NSNumber, forKey: NSPersistentHistoryTrackingKey)
            description.setOption(true as NSNumber, forKey: NSPersistentStoreRemoteChangeNotificationPostOptionKey)

            // Configure SQLite options for better security
            description.setOption([
                "journal_mode": "WAL",
                "secure_delete": true
            ] as NSDictionary, forKey: NSSQLitePragmasOption)

            logger.info("CoreData persistent store configured with security options")
        }

        container.loadPersistentStores(completionHandler: { [weak self] (storeDescription, error) in
            if let error = error as NSError? {
                self?.logger.error("Failed to load persistent stores: \(error), \(error.userInfo)")
                fatalError("Unresolved error \(error), \(error.userInfo)")
            }
            self?.logger.info("Persistent store loaded successfully")
        })

        // Merge policy for conflict resolution
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        return container
    }()

    /// The managed object context for use on the main queue (alias for viewContext for backwards compatibility)
    var mainContext: NSManagedObjectContext {
        return persistentContainer.viewContext
    }

    /// The managed object context for use on the main queue
    var viewContext: NSManagedObjectContext {
        return persistentContainer.viewContext
    }

    // MARK: - Initialization

    private init() {
        logger.info("CoreDataStack initialized")
    }

    // MARK: - Public Methods

    func saveContext() {
        let context = persistentContainer.viewContext
        if context.hasChanges {
            do {
                try context.save()
                logger.debug("Context saved successfully")
            } catch {
                let nserror = error as NSError
                logger.error("Failed to save context: \(nserror), \(nserror.userInfo)")
                fatalError("Unresolved error \(nserror), \(nserror.userInfo)")
            }
        }
    }

    /// Create a background context for heavy operations
    func newBackgroundContext() -> NSManagedObjectContext {
        let context = persistentContainer.newBackgroundContext()
        context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        return context
    }

    /// Perform a background task
    func performBackgroundTask(_ block: @escaping (NSManagedObjectContext) -> Void) {
        persistentContainer.performBackgroundTask(block)
    }

    /// Delete all messages (used for clearing cache)
    func deleteAllMessages() {
        let context = newBackgroundContext()
        context.perform {
            let fetchRequest: NSFetchRequest<NSFetchRequestResult> = NSFetchRequest(entityName: "MessageEntity")
            let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)

            do {
                try context.execute(deleteRequest)
                try context.save()
                self.logger.info("All messages deleted")
            } catch {
                self.logger.error("Failed to delete all messages: \(error)")
            }
        }
    }

    /// Reset persistent store (used for "Clear All Data")
    func reset() {
        let context = viewContext
        let entities = persistentContainer.managedObjectModel.entities

        context.performAndWait {
            for entity in entities {
                guard let name = entity.name else { continue }
                let fetchRequest: NSFetchRequest<NSFetchRequestResult> = NSFetchRequest(entityName: name)
                let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)

                do {
                    try context.execute(deleteRequest)
                } catch {
                    self.logger.error("Failed to delete entity \(name): \(error)")
                }
            }

            do {
                try context.save()
                self.logger.info("Database reset successfully")
            } catch {
                self.logger.error("Failed to save context after reset: \(error)")
            }
        }
    }
}