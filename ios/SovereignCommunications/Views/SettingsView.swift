import SwiftUI

struct SettingsView: View {
    @AppStorage("localPeerId") private var localPeerId = ""
    @AppStorage("displayName") private var displayName = "Anonymous"
    @State private var isDarkMode = false
    @State private var enableNotifications = true
    @State private var autoBackup = false
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Identity")) {
                    HStack {
                        Text("Display Name")
                        Spacer()
                        TextField("Your name", text: $displayName)
                            .multilineTextAlignment(.trailing)
                    }
                    
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Your Peer ID")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(localPeerId.isEmpty ? "Not generated" : String(localPeerId.prefix(32)) + "...")
                            .font(.caption)
                            .fontDesign(.monospaced)
                    }
                    
                    Button("View QR Code") {
                        // TODO: Show QR code
                    }
                    
                    Button("Backup Identity") {
                        // TODO: Export identity
                    }
                }
                
                Section(header: Text("Network")) {
                    HStack {
                        Text("Status")
                        Spacer()
                        ConnectionStatusBadge()
                    }
                    
                    HStack {
                        Text("Connected Peers")
                        Spacer()
                        Text("0")
                            .foregroundColor(.secondary)
                    }
                    
                    Toggle("Enable mDNS Discovery", isOn: .constant(true))
                    Toggle("Enable BLE Mesh", isOn: .constant(true))
                }
                
                Section(header: Text("Appearance")) {
                    Toggle("Dark Mode", isOn: $isDarkMode)
                    Toggle("Enable Notifications", isOn: $enableNotifications)
                }
                
                Section(header: Text("Data")) {
                    Toggle("Auto Backup", isOn: $autoBackup)
                    
                    Button("Export Data") {
                        // TODO: Export all data
                    }
                    
                    Button("Clear Messages", role: .destructive) {
                        // TODO: Clear all messages
                    }
                }
                
                Section(header: Text("About")) {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    
                    Link("Protocol Documentation", destination: URL(string: "https://github.com")!)
                    Link("Privacy Policy", destination: URL(string: "https://github.com")!)
                }
            }
            .navigationTitle("Settings")
        }
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
    }
}
