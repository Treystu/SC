import SwiftUI

@main
struct SovereignCommunicationsApp: App {
    let persistenceController = CoreDataStack.shared
    
    init() {
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

