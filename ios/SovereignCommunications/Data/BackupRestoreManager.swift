import Foundation
import CoreData

class BackupRestoreManager {
    
    // MARK: - Properties
    
    private let coreDataStack = CoreDataStack.shared
    
    // MARK: - Public Methods
    
    func backupData() -> URL? {
        let context = coreDataStack.mainContext
        let storeURL = coreDataStack.persistentContainer.persistentStoreDescriptions.first?.url
        
        do {
            try context.save()
            let backupURL = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("backup.sqlite")
            try? FileManager.default.removeItem(at: backupURL)
            try FileManager.default.copyItem(at: storeURL!, to: backupURL)
            return backupURL
        } catch {
            print("Error backing up data: \(error)")
            return nil
        }
    }
    
    func restoreData(from backupURL: URL) -> Bool {
        let context = coreDataStack.mainContext
        let storeURL = coreDataStack.persistentContainer.persistentStoreDescriptions.first?.url
        
        do {
            try coreDataStack.persistentContainer.persistentStoreCoordinator.replacePersistentStore(at: storeURL!,
                                                                                                  destinationOptions: nil,
                                                                                                  withPersistentStoreFrom: backupURL,
                                                                                                  sourceOptions: nil,
                                                                                                  ofType: NSSQLiteStoreType)
            return true
        } catch {
            print("Error restoring data: \(error)")
            return false
        }
    }
}