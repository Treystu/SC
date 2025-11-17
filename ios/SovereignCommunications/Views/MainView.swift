import SwiftUI

struct MainView: View {
    @State private var selectedTab = 0
    @State private var showOnboarding = !UserDefaults.standard.bool(forKey: "onboarding_complete")
    @State private var localPeerId = "generated_peer_id_placeholder" // TODO: Get from MeshNetwork
    
    var body: some View {
        if showOnboarding {
            OnboardingView(
                localPeerId: localPeerId,
                onComplete: {
                    showOnboarding = false
                }
            )
        } else {
            TabView(selection: $selectedTab) {
                ConversationListView()
                    .tabItem {
                        Label("Conversations", systemImage: "message.fill")
                    }
                    .tag(0)
                
                ContactListView()
                    .tabItem {
                        Label("Contacts", systemImage: "person.2.fill")
                    }
                    .tag(1)
                
                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .tag(2)
            }
            .accentColor(.green)
        }
    }
}

struct MainView_Previews: PreviewProvider {
    static var previews: some View {
        MainView()
    }
}
