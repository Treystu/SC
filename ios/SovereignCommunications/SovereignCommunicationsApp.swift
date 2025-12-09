import SwiftUI

@main
struct SovereignCommunicationsApp: App {
    let persistenceController = CoreDataStack.shared
    @StateObject private var appState = AppState()
    
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
                .environmentObject(appState)
                .onAppear {
                    // Schedule background tasks when app appears
                    BackgroundTaskManager.shared.scheduleAppRefresh()
                    BackgroundTaskManager.shared.scheduleCleanup()
                }
                .onOpenURL { url in
                    handleIncomingURL(url)
                }
        }
    }
    
    /// Handle incoming URLs (deep links and universal links)
    private func handleIncomingURL(_ url: URL) {
        print("📲 Received URL: \(url)")
        
        // Use ShareManager to parse the URL
        if let inviteCode = ShareManager.shared.handleIncomingURL(url) {
            print("✅ Extracted invite code: \(String(inviteCode.prefix(16)))...")
            
            // Store the pending invite for processing
            UserDefaults.standard.set(inviteCode, forKey: "pendingInviteCode")
            
            // Notify the app state
            appState.pendingInviteCode = inviteCode
        }
    }
}

/// App-wide state for handling deep links and other shared state
class AppState: ObservableObject {
    @Published var pendingInviteCode: String?
    @Published var pendingPeerConnection: String?
    
    /// Clear pending invite after processing
    func clearPendingInvite() {
        pendingInviteCode = nil
        UserDefaults.standard.removeObject(forKey: "pendingInviteCode")
    }
    
    /// Check for any pending invites from previous launches
    func checkPendingInvites() {
        if let code = UserDefaults.standard.string(forKey: "pendingInviteCode") {
            pendingInviteCode = code
        }
    }
}

