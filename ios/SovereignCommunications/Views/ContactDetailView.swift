import SwiftUI

/// Contact detail view with verification and management options.
struct ContactDetailView: View {
    let contact: ContactEntity
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    @State private var showBlockAlert = false
    @State private var showDeleteAlert = false
    @State private var isVerified: Bool = false
    
    init(contact: ContactEntity) {
        self.contact = contact
        _isVerified = State(initialValue: contact.isVerified)
    }
    
    var body: some View {
        List {
            // Contact Information
            Section("Contact Information") {
                HStack {
                    Text("Name")
                    Spacer()
                    Text(contact.displayName ?? "Unknown")
                        .foregroundColor(.secondary)
                }
                
                HStack {
                    Text("Peer ID")
                    Spacer()
                    Text(contact.id?.prefix(16) ?? "")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundColor(.secondary)
                }
            }
            
            // Public Key Fingerprint
            Section("Security") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Public Key Fingerprint")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Text(contact.publicKeyFingerprint ?? "N/A")
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                }
                
                Toggle("Verified Contact", isOn: $isVerified)
                    .onChange(of: isVerified) { newValue in
                        contact.isVerified = newValue
                        try? viewContext.save()
                    }
            }
            
            // Last Active
            if let lastSeen = contact.lastSeen {
                Section("Activity") {
                    HStack {
                        Text("Last Active")
                        Spacer()
                        Text(formatRelativeTime(lastSeen))
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            // Actions
            Section {
                Button(role: .destructive) {
                    showBlockAlert = true
                } label: {
                    Label("Block Contact", systemImage: "hand.raised")
                }
                
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Label("Delete Contact", systemImage: "trash")
                }
            }
        }
        .navigationTitle("Contact Details")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Block Contact", isPresented: $showBlockAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Block", role: .destructive) {
                contact.isBlocked = true
                try? viewContext.save()
            }
        } message: {
            Text("Are you sure you want to block this contact? They will no longer be able to send you messages.")
        }
        .alert("Delete Contact", isPresented: $showDeleteAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                viewContext.delete(contact)
                try? viewContext.save()
                dismiss()
            }
        } message: {
            Text("Are you sure you want to delete this contact? This action cannot be undone.")
        }
    }
    
    private func formatRelativeTime(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        
        if interval < 60 {
            return "Just now"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes) minute\(minutes == 1 ? "" : "s") ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours) hour\(hours == 1 ? "" : "s") ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days) day\(days == 1 ? "" : "s") ago"
        }
    }
}
