import SwiftUI

struct MainView: View {
    @State private var selectedTab = 0
    @State private var showOnboarding = !UserDefaults.standard.bool(forKey: "onboarding_complete")
    @State private var localPeerId = UserDefaults.standard.string(forKey: "localPeerId") ?? UUID().uuidString
    
    @EnvironmentObject private var appState: AppState
    @State private var showInviteHandling = false
    
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
                
                NavigationView {
                    PeerDiscoveryView()
                }
                .tabItem {
                    Label("Peers", systemImage: "person.3.fill")
                }
                .tag(2)

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gearshape.fill")
                    }
                    .tag(3)
            }
            .accentColor(.green)
            .onAppear {
                // Check for pending invites on appear
                appState.checkPendingInvites()
            }
            .onChange(of: appState.pendingInviteCode) { newCode in
                if newCode != nil {
                    showInviteHandling = true
                }
            }
            .sheet(isPresented: $showInviteHandling, onDismiss: {
                // Clear pending invite after handling
                appState.clearPendingInvite()
            }) {
                InviteHandlingView(
                    onAccept: { code in
                        // Invite was processed successfully in InviteHandlingView
                        print("Invite accepted: \(code)")
                    },
                    onDecline: {
                        // User declined the invite
                        print("Invite declined")
                    }
                )
            }
        }
    }
}

struct MainView_Previews: PreviewProvider {
    static var previews: some View {
        MainView()
    }
}
