import SwiftUI

@main
struct SovereignCommunicationsApp: App {
    let persistenceController = CoreDataStack.shared
    
    init() {
        // Initialize encryption at startup (Task #135)
        initializeEncryption()
        
        // Register background tasks
        BackgroundTaskManager.shared.registerBackgroundTasks()
        
        // Start the mesh network
        MeshNetworkManager.shared.start()
        
        // Request notification permissions
        NotificationManager.shared.requestAuthorization { granted, error in
            if granted {
                // Schedule initial background tasks
                BackgroundTaskManager.shared.scheduleAppRefresh()
            }
        }
    }
    
    /// Initialize encryption using hardware-backed keychain
    /// This ensures all sensitive data is encrypted before the app starts
    private func initializeEncryption() {
        do {
            try KeychainManager.shared.initializeEncryption()
            print("✅ Encryption initialized successfully")
        } catch {
            print("❌ Failed to initialize encryption: \(error)")
            // In production, you might want to show an alert or handle this gracefully
        }
    }
    
    var body: some Scene {
        WindowGroup {
            MainView()
                .environment(\.managedObjectContext, persistenceController.viewContext)
                .onAppear {
                    // Schedule background tasks when app appears
                    BackgroundTaskManager.shared.scheduleAppRefresh()
                    BackgroundTaskManager.shared.scheduleCleanup()
                }
        }
    }
}

