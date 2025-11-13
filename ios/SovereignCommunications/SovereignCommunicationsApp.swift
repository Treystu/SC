import SwiftUI

@main
struct SovereignCommunicationsApp: App {
    let persistenceController = CoreDataStack.shared
    
    var body: some Scene {
        WindowGroup {
            MainView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}
