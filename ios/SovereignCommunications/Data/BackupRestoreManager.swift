import Foundation
import CoreData
import CryptoKit

class BackupRestoreManager {

    // MARK: - Properties

    private let coreDataStack = CoreDataStack.shared
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "BackupRestoreManager")

    // MARK: - Public Methods

    func backupData(passphrase: String) -> URL? {
        let context = coreDataStack.mainContext
        let storeURL = coreDataStack.persistentContainer.persistentStoreDescriptions.first?.url

        do {
            try context.save()

            // 1. Create temporary copy of SQLite db
            let tempDir = FileManager.default.temporaryDirectory
            let dbCopyURL = tempDir.appendingPathComponent("backup_temp.sqlite")

            if FileManager.default.fileExists(atPath: dbCopyURL.path) {
                try FileManager.default.removeItem(at: dbCopyURL)
            }
            try FileManager.default.copyItem(at: storeURL!, to: dbCopyURL)

            // 2. Encrypt the copy
            let encryptedURL = tempDir.appendingPathComponent("sc_backup_\(Date().timeIntervalSince1970).scdb")
            if FileManager.default.fileExists(atPath: encryptedURL.path) {
                try FileManager.default.removeItem(at: encryptedURL)
            }

            let dbData = try Data(contentsOf: dbCopyURL)
            let key = symmetricKey(from: passphrase)
            let sealedBox = try AES.GCM.seal(dbData, using: key)
            try sealedBox.combined?.write(to: encryptedURL)

            // cleanup
            try? FileManager.default.removeItem(at: dbCopyURL)

            logger.info("Backup created successfully at \(encryptedURL.path)")
            return encryptedURL

        } catch {
            logger.error("Error backing up data: \(error.localizedDescription)")
            return nil
        }
    }

    func restoreData(from backupURL: URL, passphrase: String) -> Bool {
        let context = coreDataStack.mainContext
        let storeURL = coreDataStack.persistentContainer.persistentStoreDescriptions.first?.url

        do {
            // 1. Decrypt
            let encryptedData = try Data(contentsOf: backupURL)
            let key = symmetricKey(from: passphrase)
            let sealedBox = try AES.GCM.SealedBox(combined: encryptedData)
            let decryptedData = try AES.GCM.open(sealedBox, using: key)

            // 2. Write to temp location for restoration
            let tempDir = FileManager.default.temporaryDirectory
            let decryptedURL = tempDir.appendingPathComponent("restore_temp.sqlite")

            if FileManager.default.fileExists(atPath: decryptedURL.path) {
                try FileManager.default.removeItem(at: decryptedURL)
            }
            try decryptedData.write(to: decryptedURL)

            // 3. Replace persistent store
            try coreDataStack.persistentContainer.persistentStoreCoordinator.replacePersistentStore(
                at: storeURL!,
                destinationOptions: nil,
                withPersistentStoreFrom: decryptedURL,
                sourceOptions: nil,
                ofType: NSSQLiteStoreType
            )

            // cleanup
            try? FileManager.default.removeItem(at: decryptedURL)

            logger.info("Restore successful")
            return true
        } catch {
            logger.error("Error restoring data: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Crypto Helpers

    private func symmetricKey(from passphrase: String) -> SymmetricKey {
        let salt = "SovereignCommunicationsBackupSalt".data(using: .utf8)!
        let key = PBKDF2.deriveKey(
            password: passphrase,
            salt: salt,
            hashFunction: SHA256.self,
            iterations: 10000
        )
        return key
    }
}