import SwiftUI
import CoreData

struct CompleteSettingsView: View {
    @StateObject private var viewModel = SettingsViewModel()
    @Environment(\.presentationMode) var presentationMode
    @State private var showingIdentityExport = false
    @State private var showingIdentityImport = false
    @State private var showingDeleteConfirmation = false
    
    var body: some View {
        NavigationView {
            List {
                // Profile Section
                Section(header: Text("Profile")) {
                    HStack {
                        Text("Display Name")
                        Spacer()
                        TextField("Your Name", text: $viewModel.displayName)
                            .multilineTextAlignment(.trailing)
                    }
                    
                    HStack {
                        Text("Status Message")
                        Spacer()
                        TextField("Available", text: $viewModel.statusMessage)
                            .multilineTextAlignment(.trailing)
                    }
                    
                    Toggle("Show Online Status", isOn: $viewModel.showOnlineStatus)
                }
                
                // Privacy Section
                Section(header: Text("Privacy")) {
                    Toggle("Read Receipts", isOn: $viewModel.readReceiptsEnabled)
                    Toggle("Typing Indicators", isOn: $viewModel.typingIndicatorsEnabled)
                    Toggle("Last Seen", isOn: $viewModel.lastSeenEnabled)
                    
                    Picker("Default Message TTL", selection: $viewModel.defaultTTL) {
                        Text("1 hour").tag(3600)
                        Text("6 hours").tag(21600)
                        Text("24 hours").tag(86400)
                        Text("7 days").tag(604800)
                    }
                }
                
                // Notifications Section
                Section(header: Text("Notifications")) {
                    Toggle("Enable Notifications", isOn: $viewModel.notificationsEnabled)
                    Toggle("Sound", isOn: $viewModel.notificationSound)
                    Toggle("Vibration", isOn: $viewModel.notificationVibration)
                    Toggle("Show Preview", isOn: $viewModel.notificationPreview)
                    
                    Picker("Notification Priority", selection: $viewModel.notificationPriority) {
                        Text("High").tag("high")
                        Text("Normal").tag("normal")
                        Text("Low").tag("low")
                    }
                }
                
                // Network Section
                Section(header: Text("Network")) {
                    Toggle("Auto-connect", isOn: $viewModel.autoConnect)
                    Toggle("Background Sync", isOn: $viewModel.backgroundSync)
                    Toggle("WiFi Only File Transfer", isOn: $viewModel.wifiOnlyFileTransfer)
                    
                    HStack {
                        Text("Max Connections")
                        Spacer()
                        Stepper("\(viewModel.maxConnections)", value: $viewModel.maxConnections, in: 1...10)
                    }
                    
                    Picker("Connection Quality", selection: $viewModel.connectionQuality) {
                        Text("High").tag("high")
                        Text("Balanced").tag("balanced")
                        Text("Data Saver").tag("data_saver")
                    }
                }
                
                // Storage Section
                Section(header: Text("Storage")) {
                    HStack {
                        Text("Messages Cached")
                        Spacer()
                        Text("\(viewModel.cachedMessages)")
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Storage Used")
                        Spacer()
                        Text(viewModel.storageUsed)
                            .foregroundColor(.secondary)
                    }
                    
                    Button("Clear Message Cache") {
                        viewModel.clearMessageCache()
                    }
                    .foregroundColor(.red)
                    
                    Button("Clear All Data") {
                        showingDeleteConfirmation = true
                    }
                    .foregroundColor(.red)
                }
                
                // Security Section
                Section(header: Text("Security")) {
                    NavigationLink(destination: Text("Change Passphrase")) {
                        Text("Change Passphrase")
                    }
                    
                    Button("Export Identity") {
                        showingIdentityExport = true
                    }
                    
                    Button("Import Identity") {
                        showingIdentityImport = true
                    }
                    
                    Toggle("Require Passphrase on Start", isOn: $viewModel.requirePassphrase)
                    
                    Picker("Auto-lock", selection: $viewModel.autoLockTimeout) {
                        Text("Never").tag(0)
                        Text("1 minute").tag(60)
                        Text("5 minutes").tag(300)
                        Text("15 minutes").tag(900)
                    }
                }
                
                // Advanced Section
                Section(header: Text("Advanced")) {
                    Toggle("Developer Mode", isOn: $viewModel.developerMode)
                    
                    if viewModel.developerMode {
                        NavigationLink(destination: Text("Debug Logs")) {
                            Text("Debug Logs")
                        }
                        
                        NavigationLink(destination: Text("Network Diagnostics")) {
                            Text("Network Diagnostics")
                        }
                        
                        Button("Export Logs") {
                            viewModel.exportLogs()
                        }
                    }
                    
                    HStack {
                        Text("App Version")
                        Spacer()
                        Text(viewModel.appVersion)
                            .foregroundColor(.secondary)
                    }
                    
                    HStack {
                        Text("Peer ID")
                        Spacer()
                        Text(viewModel.peerId)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundColor(.secondary)
                    }
                }
                
                // About Section
                Section(header: Text("About")) {
                    NavigationLink(destination: Text("Privacy Policy")) {
                        Text("Privacy Policy")
                    }
                    
                    NavigationLink(destination: Text("Open Source Licenses")) {
                        Text("Open Source Licenses")
                    }
                    
                    Button("Visit Website") {
                        viewModel.openWebsite()
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarItems(trailing: Button("Done") {
                viewModel.saveSettings()
                presentationMode.wrappedValue.dismiss()
            })
            .alert(isPresented: $showingDeleteConfirmation) {
                Alert(
                    title: Text("Clear All Data?"),
                    message: Text("This will delete all messages, contacts, and settings. This cannot be undone."),
                    primaryButton: .destructive(Text("Delete")) {
                        viewModel.clearAllData()
                    },
                    secondaryButton: .cancel()
                )
            }
            .sheet(isPresented: $showingIdentityExport) {
                IdentityExportView()
            }
            .sheet(isPresented: $showingIdentityImport) {
                IdentityImportView()
            }
        }
    }
}

class SettingsViewModel: ObservableObject {
    @Published var displayName: String = ""
    @Published var statusMessage: String = ""
    @Published var showOnlineStatus: Bool = true
    @Published var readReceiptsEnabled: Bool = true
    @Published var typingIndicatorsEnabled: Bool = true
    @Published var lastSeenEnabled: Bool = true
    @Published var defaultTTL: Int = 86400
    @Published var notificationsEnabled: Bool = true
    @Published var notificationSound: Bool = true
    @Published var notificationVibration: Bool = true
    @Published var notificationPreview: Bool = true
    @Published var notificationPriority: String = "normal"
    @Published var autoConnect: Bool = true
    @Published var backgroundSync: Bool = true
    @Published var wifiOnlyFileTransfer: Bool = false
    @Published var maxConnections: Int = 5
    @Published var connectionQuality: String = "balanced"
    @Published var cachedMessages: Int = 0
    @Published var storageUsed: String = "0 MB"
    @Published var requirePassphrase: Bool = false
    @Published var autoLockTimeout: Int = 300
    @Published var developerMode: Bool = false
    @Published var appVersion: String = "1.0.0"
    @Published var peerId: String = ""
    
    init() {
        loadSettings()
        calculateStorageStats()
    }
    
    func loadSettings() {
        // Load from UserDefaults
        let defaults = UserDefaults.standard
        displayName = defaults.string(forKey: "displayName") ?? ""
        statusMessage = defaults.string(forKey: "statusMessage") ?? ""
        showOnlineStatus = defaults.bool(forKey: "showOnlineStatus")
        readReceiptsEnabled = defaults.bool(forKey: "readReceiptsEnabled")
        typingIndicatorsEnabled = defaults.bool(forKey: "typingIndicatorsEnabled")
        lastSeenEnabled = defaults.bool(forKey: "lastSeenEnabled")
        defaultTTL = defaults.integer(forKey: "defaultTTL")
        notificationsEnabled = defaults.bool(forKey: "notificationsEnabled")
        notificationSound = defaults.bool(forKey: "notificationSound")
        notificationVibration = defaults.bool(forKey: "notificationVibration")
        notificationPreview = defaults.bool(forKey: "notificationPreview")
        notificationPriority = defaults.string(forKey: "notificationPriority") ?? "normal"
        autoConnect = defaults.bool(forKey: "autoConnect")
        backgroundSync = defaults.bool(forKey: "backgroundSync")
        wifiOnlyFileTransfer = defaults.bool(forKey: "wifiOnlyFileTransfer")
        maxConnections = defaults.integer(forKey: "maxConnections")
        connectionQuality = defaults.string(forKey: "connectionQuality") ?? "balanced"
        requirePassphrase = defaults.bool(forKey: "requirePassphrase")
        autoLockTimeout = defaults.integer(forKey: "autoLockTimeout")
        developerMode = defaults.bool(forKey: "developerMode")
        peerId = defaults.string(forKey: "peerId") ?? generatePeerId()
    }
    
    func saveSettings() {
        let defaults = UserDefaults.standard
        defaults.set(displayName, forKey: "displayName")
        defaults.set(statusMessage, forKey: "statusMessage")
        defaults.set(showOnlineStatus, forKey: "showOnlineStatus")
        defaults.set(readReceiptsEnabled, forKey: "readReceiptsEnabled")
        defaults.set(typingIndicatorsEnabled, forKey: "typingIndicatorsEnabled")
        defaults.set(lastSeenEnabled, forKey: "lastSeenEnabled")
        defaults.set(defaultTTL, forKey: "defaultTTL")
        defaults.set(notificationsEnabled, forKey: "notificationsEnabled")
        defaults.set(notificationSound, forKey: "notificationSound")
        defaults.set(notificationVibration, forKey: "notificationVibration")
        defaults.set(notificationPreview, forKey: "notificationPreview")
        defaults.set(notificationPriority, forKey: "notificationPriority")
        defaults.set(autoConnect, forKey: "autoConnect")
        defaults.set(backgroundSync, forKey: "backgroundSync")
        defaults.set(wifiOnlyFileTransfer, forKey: "wifiOnlyFileTransfer")
        defaults.set(maxConnections, forKey: "maxConnections")
        defaults.set(connectionQuality, forKey: "connectionQuality")
        defaults.set(requirePassphrase, forKey: "requirePassphrase")
        defaults.set(autoLockTimeout, forKey: "autoLockTimeout")
        defaults.set(developerMode, forKey: "developerMode")
        defaults.set(peerId, forKey: "peerId")
    }
    
    func calculateStorageStats() {
        // Calculate storage usage
        // This is a placeholder - implement actual calculation
        cachedMessages = 0
        storageUsed = "0 MB"
    }
    
    func clearMessageCache() {
        // Clear message cache
        cachedMessages = 0
        storageUsed = "0 MB"
    }
    
    func clearAllData() {
        // Clear all data
        let defaults = UserDefaults.standard
        defaults.removePersistentDomain(forName: Bundle.main.bundleIdentifier!)
        cachedMessages = 0
        storageUsed = "0 MB"
    }
    
    func exportLogs() {
        // Export debug logs
        print("Exporting logs...")
    }
    
    func openWebsite() {
        if let url = URL(string: "https://sovereign-communications.example.com") {
            UIApplication.shared.open(url)
        }
    }
    
    private func generatePeerId() -> String {
        return UUID().uuidString.prefix(8).lowercased()
    }
}

struct IdentityExportView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var passphrase: String = ""
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Encryption Passphrase")) {
                    SecureField("Enter passphrase", text: $passphrase)
                    Text("Your identity will be encrypted with this passphrase")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Section {
                    Button("Export Identity") {
                        // Implement export
                        presentationMode.wrappedValue.dismiss()
                    }
                    .disabled(passphrase.isEmpty)
                }
            }
            .navigationTitle("Export Identity")
            .navigationBarItems(trailing: Button("Cancel") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}

struct IdentityImportView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var passphrase: String = ""
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Select Identity File")) {
                    Button("Choose File") {
                        // Implement file picker
                    }
                }
                
                Section(header: Text("Decryption Passphrase")) {
                    SecureField("Enter passphrase", text: $passphrase)
                }
                
                Section {
                    Button("Import Identity") {
                        // Implement import
                        presentationMode.wrappedValue.dismiss()
                    }
                    .disabled(passphrase.isEmpty)
                }
            }
            .navigationTitle("Import Identity")
            .navigationBarItems(trailing: Button("Cancel") {
                presentationMode.wrappedValue.dismiss()
            })
        }
    }
}
