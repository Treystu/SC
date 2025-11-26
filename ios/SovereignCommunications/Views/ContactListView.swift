import SwiftUI
import CoreData

struct ContactListView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \ContactEntity.displayName, ascending: true)],
        animation: .default)
    private var contacts: FetchedResults<ContactEntity>
    
    @State private var showingScanner = false
    
    var body: some View {
        NavigationView {
            Group {
                if contacts.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "person.2.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        Text("No contacts yet")
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("Scan a QR code or enter peer ID to add a contact")
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .padding()
                } else {
                    List {
                        ForEach(contacts) { contact in
                            ContactRow(contact: contact)
                        }
                    }
                    .listStyle(InsetGroupedListStyle())
                }
            }
            .navigationTitle("Contacts")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingScanner = true }) {
                        Image(systemName: "qrcode.viewfinder")
                    }
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {}) {
                        Image(systemName: "person.badge.plus")
                    }
                }
            }
            .sheet(isPresented: $showingScanner) {
                QRCodeScannerView { scannedCode in
                    if let peerInfo = PeerInfo.fromQRString(scannedCode) {
                        addContact(from: peerInfo)
                    }
                }
            }
        }
    }

    private func addContact(from peerInfo: PeerInfo) {
        let newContact = ContactEntity(context: viewContext)
        newContact.id = peerInfo.id
        newContact.displayName = "Scanned Peer" // Placeholder
        newContact.publicKey = peerInfo.publicKey
        newContact.lastSeen = Date()
        
        do {
            try viewContext.save()
        } catch {
            let nsError = error as NSError
            fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
        }
    }
}

struct ContactRow: View {
    let contact: ContactEntity
    
    var body: some View {
        HStack {
            Circle()
                .fill(Color.blue)
                .frame(width: 50, height: 50)
                .overlay(
                    Text(contact.displayName?.prefix(1).uppercased() ?? "U")
                        .foregroundColor(.white)
                        .font(.title3)
                        .fontWeight(.semibold)
                )
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(contact.displayName ?? "Unknown")
                        .font(.headline)
                    
                    if contact.isVerified {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundColor(.green)
                            .font(.caption)
                    }
                }
                
                Text(String(contact.publicKey?.prefix(16) ?? "No public key") + "...")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fontDesign(.monospaced)
                
                if let lastSeen = contact.lastSeen {
                    Text("Last seen \(lastSeen, style: .relative)")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            if contact.isFavorite {
                Image(systemName: "star.fill")
                    .foregroundColor(.yellow)
            }
        }
        .padding(.vertical, 4)
    }
}
