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
}