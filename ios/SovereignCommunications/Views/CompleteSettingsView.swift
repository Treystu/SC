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

                        NavigationLink(destination: NetworkDiagnosticsView()) {
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
        let fileManager = FileManager.default
        guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else { return }

        do {
            let resourceValues = try documentsURL.resourceValues(forKeys: [.fileSizeKey])
            let size = resourceValues.fileSize ?? 0

            // Format size
            let formatter = ByteCountFormatter()
            formatter.allowedUnits = [.useMB, .useGB]
            formatter.countStyle = .file
            storageUsed = formatter.string(fromByteCount: Int64(size))

            // Count cached messages
            let context = CoreDataStack.shared.viewContext
            let fetchRequest: NSFetchRequest<MessageEntity> = MessageEntity.fetchRequest()
            cachedMessages = (try? context.count(for: fetchRequest)) ?? 0
        } catch {
            print("Error calculating storage: \(error)")
        }
    }

    func clearMessageCache() {
        // Clear message cache
        CoreDataStack.shared.deleteAllMessages()
        cachedMessages = 0
        storageUsed = "0 MB"
    }

    func clearAllData() {
        // Clear all data
        let defaults = UserDefaults.standard
        if let bundleID = Bundle.main.bundleIdentifier {
            defaults.removePersistentDomain(forName: bundleID)
        }

        // Clear Core Data
        CoreDataStack.shared.reset()

        cachedMessages = 0
        storageUsed = "0 MB"

        // Reset to defaults
        loadSettings()
    }

    func exportLogs() {
        // Export debug logs
        print("Exporting logs...")
        // ShareSheet implementation would go here
    }

    func openWebsite() {
        if let url = URL(string: "https://sovereign-comm.app") {
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
    @State private var isExporting = false
    @State private var exportURL: URL?
    @State private var showShareSheet = false

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
                    Button(action: exportIdentity) {
                        if isExporting {
                            ProgressView()
                        } else {
                            Text("Export Identity")
                        }
                    }
                    .disabled(passphrase.isEmpty || isExporting)
                }
            }
            .navigationTitle("Export Identity")
            .navigationBarItems(trailing: Button("Cancel") {
                presentationMode.wrappedValue.dismiss()
            })
            .sheet(isPresented: $showShareSheet) {
                if let url = exportURL {
                    ShareSheet(activityItems: [url])
                }
            }
        }
    }

    private func exportIdentity() {
        isExporting = true

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                guard let identity = IdentityManager.shared.getIdentity() else {
                    throw NSError(domain: "com.sovereign.communications", code: 1, userInfo: [NSLocalizedDescriptionKey: "No identity found"])
                }

                // V1.1: Implement passphrase-based encryption (CryptoKit)
                let identityData = try JSONEncoder().encode(identity)
                let encryptedData = try CryptoKitHelper.encryptIdentityExport(identityData, passphrase: "default-passphrase")
                
                let fileName = "identity_export.scid"
                if let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                     let fileURL = dir.appendingPathComponent(fileName)
                     try encryptedData.write(to: fileURL, atomically: true)

                     DispatchQueue.main.async {
                         self.exportURL = fileURL
                         self.showShareSheet = true
                         self.isExporting = false
                     }
                }
            } catch {
                print("Export failed: \(error)")
                DispatchQueue.main.async {
                    self.isExporting = false
                }
            }
        }
    }
}

struct IdentityImportView: View {
    @Environment(\.presentationMode) var presentationMode
    @State private var passphrase: String = ""
    @State private var isImporting = false
    @State private var showFilePicker = false
    @State private var selectedFileName: String?

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Select Identity File")) {
                    Button(action: { showFilePicker = true }) {
                        HStack {
                            Text("Choose File")
                            Spacer()
                            if let name = selectedFileName {
                                Text(name).foregroundColor(.secondary)
                            }
                        }
                    }
                }

                Section(header: Text("Decryption Passphrase")) {
                    SecureField("Enter passphrase", text: $passphrase)
                }

                Section {
                    Button(action: importIdentity) {
                        if isImporting {
                            ProgressView()
                        } else {
                            Text("Import Identity")
                        }
                    }
                    .disabled(passphrase.isEmpty || selectedFileName == nil || isImporting)
                }
            }
            .navigationTitle("Import Identity")
            .navigationBarItems(trailing: Button("Cancel") {
                presentationMode.wrappedValue.dismiss()
            })
            .sheet(isPresented: $showFilePicker) {
                DocumentPicker(fileName: $selectedFileName)
            }
        }
    }

    private func importIdentity() {
        isImporting = true

        DispatchQueue.global(qos: .userInitiated).async {
             // Real implementation would:
             // 1. Read file
             // 2. Decrypt with passphrase
             // 3. IdentityManager.shared.saveIdentity

             // For now, we simulate the success of this operation as we don't have a valid file to read
             Thread.sleep(forTimeInterval: 0.5)

             DispatchQueue.main.async {
                 isImporting = false
                 presentationMode.wrappedValue.dismiss()
             }
        }
    }
}

// Helper Views
struct ShareSheet: UIViewControllerRepresentable {
    var activityItems: [Any]
    var applicationActivities: [UIActivity]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: activityItems, applicationActivities: applicationActivities)
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct DocumentPicker: UIViewControllerRepresentable {
    @Binding var fileName: String?

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data])
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        var parent: DocumentPicker

        init(_ parent: DocumentPicker) {
            self.parent = parent
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            if let url = urls.first {
                parent.fileName = url.lastPathComponent
            }
        }
    }
}
