//
//  BackgroundTaskManager.swift
//  Sovereign Communications
//
//  Manages background tasks and background refresh for iOS
//

import Foundation
import BackgroundTasks
import os.log

/// Manages background task scheduling and execution
class BackgroundTaskManager {
    static let shared = BackgroundTaskManager()
    
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "BackgroundTasks")
    
    // Task identifiers (must match Info.plist BGTaskSchedulerPermittedIdentifiers)
    static let refreshTaskIdentifier = "com.sovereign.communications.refresh"
    static let cleanupTaskIdentifier = "com.sovereign.communications.cleanup"
    static let syncTaskIdentifier = "com.sovereign.communications.sync"
    
    private init() {}
    
    // MARK: - Registration
    
    /// Register background tasks with the system
    /// Call this in application(_:didFinishLaunchingWithOptions:)
    func registerBackgroundTasks() {
        // Register app refresh task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.refreshTaskIdentifier,
            using: nil
        ) { [weak self] task in
            self?.handleAppRefresh(task: task as! BGAppRefreshTask)
        }
        
        // Register cleanup task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.cleanupTaskIdentifier,
            using: nil
        ) { [weak self] task in
            self?.handleCleanup(task: task as! BGProcessingTask)
        }
        
        // Register sync task
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.syncTaskIdentifier,
            using: nil
        ) { [weak self] task in
            self?.handleSync(task: task as! BGProcessingTask)
        }
        
        logger.info("Background tasks registered")
    }
    
    // MARK: - Scheduling
    
    /// Schedule background app refresh
    func scheduleAppRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshTaskIdentifier)
        
        // Schedule for 15 minutes from now (minimum)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        
        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("App refresh task scheduled")
        } catch {
            logger.error("Failed to schedule app refresh: \(error.localizedDescription)")
        }
    }
    
    /// Schedule background cleanup task
    func scheduleCleanup() {
        let request = BGProcessingTaskRequest(identifier: Self.cleanupTaskIdentifier)
        
        // Schedule for 1 hour from now
        request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
        
        // Require external power and network
        request.requiresNetworkConnectivity = false
        request.requiresExternalPower = false
        
        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Cleanup task scheduled")
        } catch {
            logger.error("Failed to schedule cleanup: \(error.localizedDescription)")
        }
    }
    
    /// Schedule background sync task
    func scheduleSync() {
        let request = BGProcessingTaskRequest(identifier: Self.syncTaskIdentifier)
        
        // Schedule for 30 minutes from now
        request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        
        // Require network connectivity for sync
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        
        do {
            try BGTaskScheduler.shared.submit(request)
            logger.info("Sync task scheduled")
        } catch {
            logger.error("Failed to schedule sync: \(error.localizedDescription)")
        }
    }
    
    /// Cancel all pending background tasks
    func cancelAllTasks() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.refreshTaskIdentifier)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.cleanupTaskIdentifier)
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.syncTaskIdentifier)
        logger.info("All background tasks cancelled")
    }
    
    // MARK: - Task Handlers
    
    private func handleAppRefresh(task: BGAppRefreshTask) {
        logger.info("Handling app refresh task")
        
        // Schedule next refresh
        scheduleAppRefresh()
        
        // Create task operation
        let operation = RefreshOperation()
        
        // Set expiration handler
        task.expirationHandler = {
            self.logger.warning("App refresh task expired")
            operation.cancel()
        }
        
        // Set completion handler
        operation.completionBlock = {
            task.setTaskCompleted(success: !operation.isCancelled)
        }
        
        // Execute operation
        OperationQueue().addOperation(operation)
    }
    
    private func handleCleanup(task: BGProcessingTask) {
        logger.info("Handling cleanup task")
        
        // Schedule next cleanup
        scheduleCleanup()
        
        let operation = CleanupOperation()
        
        task.expirationHandler = {
            self.logger.warning("Cleanup task expired")
            operation.cancel()
        }
        
        operation.completionBlock = {
            task.setTaskCompleted(success: !operation.isCancelled)
        }
        
        OperationQueue().addOperation(operation)
    }
    
    private func handleSync(task: BGProcessingTask) {
        logger.info("Handling sync task")
        
        // Schedule next sync
        scheduleSync()
        
        let operation = SyncOperation()
        
        task.expirationHandler = {
            self.logger.warning("Sync task expired")
            operation.cancel()
        }
        
        operation.completionBlock = {
            task.setTaskCompleted(success: !operation.isCancelled)
        }
        
        OperationQueue().addOperation(operation)
    }
}

// MARK: - Operations

/// Background refresh operation
private class RefreshOperation: Operation {
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "BackgroundRefresh")
    
    override func main() {
        if isCancelled { return }
        
        logger.info("Starting refresh operation")
        
        // Trigger mesh network refresh
        MeshNetworkManager.shared.refreshState { success in
            if success {
                self.logger.info("Mesh network state refreshed")
            } else {
                self.logger.error("Failed to refresh mesh network state")
            }
        }
        
        logger.info("Refresh operation completed")
    }
}

/// Background cleanup operation
private class CleanupOperation: Operation {
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "BackgroundCleanup")
    
    override func main() {
        if isCancelled { return }
        
        logger.info("Starting cleanup operation")
        
        // Clean up old messages
        let context = CoreDataStack.shared.newBackgroundContext()
        
        context.performAndWait {
            // Delete messages older than 30 days
            let thirtyDaysAgo = Date().addingTimeInterval(-30 * 24 * 60 * 60)
            let request = MessageEntity.fetchRequest()
            request.predicate = NSPredicate(format: "timestamp < %@", thirtyDaysAgo as NSDate)
            
            do {
                let oldMessages = try context.fetch(request)
                for message in oldMessages {
                    context.delete(message)
                }
                
                if context.hasChanges {
                    try context.save()
                    self.logger.info("Deleted \(oldMessages.count) old messages")
                }
            } catch {
                self.logger.error("Cleanup failed: \(error.localizedDescription)")
            }
        }
        
        logger.info("Cleanup operation completed")
    }
}

/// Background sync operation
private class SyncOperation: Operation {
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "BackgroundSync")
    
    override func main() {
        if isCancelled { return }
        
        logger.info("Starting sync operation")
        
        // Perform mesh synchronization
        MeshNetworkManager.shared.performSync { result in
            switch result {
            case .success(let count):
                self.logger.info("Sync completed. Synced \(count) items")
            case .failure(let error):
                self.logger.error("Sync failed: \(error.localizedDescription)")
            }
        }
        
        logger.info("Sync operation completed")
    }
}

/// Manager for Mesh Network interactions
class MeshNetworkManager {
    static let shared = MeshNetworkManager()
    
    private init() {}
    
    func refreshState(completion: @escaping (Bool) -> Void) {
        // Bridge to Core Mesh Library
        // In a real implementation, this calls into the C++/Rust core
        completion(true)
    }
    
    func performSync(completion: @escaping (Result<Int, Error>) -> Void) {
        // Bridge to Core Mesh Library
        // In a real implementation, this triggers the sync engine
        completion(.success(0))
    }
}
