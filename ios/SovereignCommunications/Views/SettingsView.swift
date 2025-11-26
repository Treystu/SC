import SwiftUI

struct SettingsView: View {
    @AppStorage("localPeerId") private var localPeerId = ""
    @AppStorage("displayName") private var displayName = "Anonymous"
    @AppStorage("enableiCloudSync") private var enableiCloudSync = false
    @AppStorage("enableNotifications") private var enableNotifications = true
    @AppStorage("enableDarkMode") private var enableDarkMode = false
    @AppStorage("autoBackup") private var autoBackup = false
    
    @State private var notificationStatus: UNAuthorizationStatus = .notDetermined
    @State private var showingKeyBackup = false
    @State private var showingQRCode = false
    
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
                        showingQRCode = true
                    }
                    
                    Button("Backup Identity Keys") {
                        showingKeyBackup = true
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
                
                Section(header: Text("Sync & Storage")) {
                    Toggle("iCloud Sync", isOn: $enableiCloudSync)
                        .onChange(of: enableiCloudSync) { newValue in
                            CoreDataStack.shared.setCloudSyncEnabled(newValue)
                        }
                    
                    Text("iCloud sync requires app restart to take effect.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Section(header: Text("Notifications")) {
                    Toggle("Enable Notifications", isOn: $enableNotifications)
                        .onChange(of: enableNotifications) { newValue in
                            if newValue {
                                requestNotificationPermission()
                            }
                        }
                    
                    HStack {
                        Text("Status")
                        Spacer()
                        Text(notificationStatusText)
                            .foregroundColor(notificationStatus == .authorized ? .green : .secondary)
                    }
                    
                    if notificationStatus != .authorized {
                        Button("Open Settings") {
                            openAppSettings()
                        }
                    }
                }
                
                Section(header: Text("Appearance")) {
                    Toggle("Dark Mode", isOn: $enableDarkMode)
                    Toggle("Auto Backup", isOn: $autoBackup)
                }
                
                Section(header: Text("Data Management")) {
                    Button("Export Data") {
                        // TODO: Export all data
                    }
                    
                    Button("Clear Cache") {
                        clearCache()
                    }
                    
                    Button("Clear Messages", role: .destructive) {
                        clearAllMessages()
                    }
                }
                
                Section(header: Text("About")) {
                    HStack {
                        Text("Version")
                        Spacer()
                        Text("1.0.0")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Build")
                        Spacer()
                        Text("1")
                            .foregroundColor(.secondary)
                    }
                    
                    Link("Protocol Documentation", destination: URL(string: "https://github.com/Treystu/SC")!)
                    Link("Privacy Policy", destination: URL(string: "https://github.com/Treystu/SC")!)
                    Link("Report an Issue", destination: URL(string: "https://github.com/Treystu/SC/issues")!)
                }
            }
            .navigationTitle("Settings")
            .onAppear {
                checkNotificationStatus()
            }
            .sheet(isPresented: $showingKeyBackup) {
                KeyBackupView()
            }
            .sheet(isPresented: $showingQRCode) {
                QRCodeDisplayView(peerInfo: PeerInfo(id: localPeerId, publicKey: "placeholder_public_key", endpoints: ["placeholder_endpoint"]))
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private var notificationStatusText: String {
        switch notificationStatus {
        case .authorized:
            return "Enabled"
        case .denied:
            return "Denied"
        case .notDetermined:
            return "Not Set"
        case .provisional:
            return "Provisional"
        case .ephemeral:
            return "Ephemeral"
        @unknown default:
            return "Unknown"
        }
    }
    
    private func checkNotificationStatus() {
        NotificationManager.shared.checkAuthorizationStatus { status in
            notificationStatus = status
        }
    }
    
    private func requestNotificationPermission() {
        NotificationManager.shared.requestAuthorization { granted, _ in
            checkNotificationStatus()
        }
    }
    
    private func openAppSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
    
    private func clearCache() {
        // Clear notification badge
        NotificationManager.shared.updateBadgeCount(0)
        
        // TODO: Clear image cache, temporary files, etc.
    }
    
    private func clearAllMessages() {
        let request = MessageEntity.fetchRequest()
        
        do {
            try CoreDataStack.shared.batchDelete(fetchRequest: request)
        } catch {
            print("Error clearing messages: \(error)")
        }
    }
}

// MARK: - Key Backup View

struct KeyBackupView: View {
    @Environment(\.dismiss) var dismiss
    @State private var backupCode = ""
    @State private var showingCode = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Image(systemName: "key.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)
                
                Text("Backup Your Identity Keys")
                    .font(.title2)
                    .bold()
                
                Text("Store this backup code securely. You'll need it to restore your identity on a new device.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)
                
                if showingCode {
                    VStack(spacing: 12) {
                        Text(backupCode)
                            .font(.system(.body, design: .monospaced))
                            .padding()
                            .background(Color.secondary.opacity(0.2))
                            .cornerRadius(8)
                        
                        Button(action: copyToClipboard) {
                            Label("Copy to Clipboard", systemImage: "doc.on.doc")
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                } else {
                    Button("Generate Backup Code") {
                        generateBackupCode()
                    }
                    .buttonStyle(.borderedProminent)
                }
                
                Spacer()
            }
            .padding()
            .navigationTitle("Key Backup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func generateBackupCode() {
        // Generate a backup code from the identity keys
        // This is a simplified version - in production, use proper key derivation
        if let privateKey = try? KeychainManager.shared.retrieveIdentityPrivateKey(),
           let publicKey = try? KeychainManager.shared.retrieveIdentityPublicKey() {
            let combined = (privateKey ?? Data()) + (publicKey ?? Data())
            backupCode = combined.base64EncodedString()
            showingCode = true
        } else {
            backupCode = "ERROR: No keys found"
            showingCode = true
        }
    }
    
    private func copyToClipboard() {
        UIPasteboard.general.string = backupCode
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        SettingsView()
    }
}

