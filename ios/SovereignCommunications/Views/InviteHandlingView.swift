import SwiftUI
import CoreImage.CIFilterBuiltins

struct InviteHandlingView: View {
    @State private var inviteCode: String = ""
    @State private var isProcessing: Bool = false
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""
    @State private var showSuccess: Bool = false
    @State private var showQRScanner: Bool = false
    
    @Environment(\.presentationMode) var presentationMode
    
    let onAccept: (String) -> Void
    let onDecline: () -> Void
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Header
                Text("Join Mesh Network")
                    .font(.title)
                    .fontWeight(.bold)
                    .padding(.top, 20)
                
                Text("Enter the invite code to connect securely")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                // Invite Code Input
                VStack(alignment: .leading, spacing: 8) {
                    Text("Invite Code")
                        .font(.headline)
                    
                    TextField("Paste invite code here", text: $inviteCode)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                        .font(.system(.body, design: .monospaced))
                }
                .padding(.horizontal)
                
                // QR Code Scanner Button
                Button(action: {
                    // V1.1: Integrate with PeerDiscoveryView for QR scanning
                    showQRScanner = true
                }) {
                    HStack {
                        Image(systemName: "qrcode.viewfinder")
                        Text("Scan QR Code")
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.blue.opacity(0.1))
                    .foregroundColor(.blue)
                    .cornerRadius(10)
                }
                .padding(.horizontal)
                .sheet(isPresented: $showQRScanner) {
                    QRScannerView { scannedCode in
                        inviteCode = scannedCode
                        showQRScanner = false
                    }
                }
                
                Spacer()
                
                // Action Buttons
                VStack(spacing: 12) {
                    Button(action: {
                        acceptInvite()
                    }) {
                        HStack {
                            if isProcessing {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Image(systemName: "checkmark.circle.fill")
                                Text("Accept Invite")
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(inviteCode.isEmpty ? Color.gray : Color.green)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(inviteCode.isEmpty || isProcessing)
                    
                    Button(action: {
                        onDecline()
                        presentationMode.wrappedValue.dismiss()
                    }) {
                        HStack {
                            Image(systemName: "xmark.circle")
                            Text("Decline")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.red.opacity(0.1))
                        .foregroundColor(.red)
                        .cornerRadius(10)
                    }
                    .disabled(isProcessing)
                }
                .padding(.horizontal)
                .padding(.bottom, 20)
            }
            .navigationBarTitleDisplayMode(.inline)
            .alert(isPresented: $showError) {
                Alert(
                    title: Text("Error"),
                    message: Text(errorMessage),
                    dismissButton: .default(Text("OK"))
                )
            }
            .alert(isPresented: $showSuccess) {
                Alert(
                    title: Text("Success"),
                    message: Text("Successfully connected to peer!"),
                    dismissButton: .default(Text("OK")) {
                        presentationMode.wrappedValue.dismiss()
                    }
                )
            }
        }
    }
    
    private func acceptInvite() {
        guard !inviteCode.isEmpty else { return }
        
        isProcessing = true
        
        // Validate invite code format
        if !isValidInviteCode(inviteCode) {
            isProcessing = false
            errorMessage = "Invalid invite code format"
            showError = true
            return
        }
        
        // Process the invite - parse payload and create contact/conversation
        do {
            try processInviteCode(inviteCode)
            isProcessing = false
            showSuccess = true
        } catch let error as InviteError {
            isProcessing = false
            errorMessage = error.localizedDescription
            showError = true
        } catch {
            isProcessing = false
            errorMessage = "Failed to process invite: \(error.localizedDescription)"
            showError = true
        }
    }
    
    /// Process an invite code - parse payload, create contact and conversation
    private func processInviteCode(_ code: String) throws {
        let context = CoreDataStack.shared.viewContext
        
        // Check if this is a stateless invite (contains a dot separator)
        if code.contains(".") {
            // Parse stateless invite: base64(payload).hex(signature)
            let parts = code.split(separator: ".", maxSplits: 1)
            guard parts.count == 2 else {
                throw InviteError.invalidFormat
            }
            
            let encodedPayload = String(parts[0])
            
            // Decode payload
            guard let payloadData = Data(base64Encoded: encodedPayload),
                  let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any] else {
                throw InviteError.invalidPayload
            }
            
            // Extract invite data
            guard let peerId = payload["pid"] as? String,
                  let publicKeyHex = payload["pk"] as? String,
                  !peerId.isEmpty else {
                throw InviteError.missingPeerInfo
            }
            
            let peerName = payload["n"] as? String
            
            // Check if contact already exists
            let fetchRequest: NSFetchRequest<ContactEntity> = ContactEntity.fetchRequest()
            fetchRequest.predicate = NSPredicate(format: "id == %@", peerId)
            
            if let existingContacts = try? context.fetch(fetchRequest), !existingContacts.isEmpty {
                // Contact already exists, just create conversation if needed
                try createConversation(for: existingContacts[0], in: context)
            } else {
                // Create new contact
                let contact = ContactEntity(context: context)
                contact.id = peerId
                contact.publicKey = publicKeyHex
                contact.displayName = peerName ?? "New Contact"
                contact.lastSeen = Date()
                contact.isVerified = true // Auto-verified through invite signature
                contact.isFavorite = false
                
                // Create conversation for the contact
                try createConversation(for: contact, in: context)
            }
            
            // Save context
            CoreDataStack.shared.save(context: context)
            
            // Call success callback
            onAccept(code)
            
        } else {
            // Legacy/local invite code - just call callback for now
            // This handles the case where the code is a local reference
            onAccept(code)
        }
    }
    
    /// Create a conversation for a contact if one doesn't exist
    private func createConversation(for contact: ContactEntity, in context: NSManagedObjectContext) throws {
        // Check if conversation already exists
        let fetchRequest: NSFetchRequest<ConversationEntity> = ConversationEntity.fetchRequest()
        fetchRequest.predicate = NSPredicate(format: "contactId == %@", contact.id)
        
        if let existingConversations = try? context.fetch(fetchRequest), !existingConversations.isEmpty {
            // Conversation already exists, no need to create
            return
        }
        
        // Create new conversation
        let conversation = ConversationEntity(context: context)
        conversation.id = contact.id // Use peerId as conversation ID for 1:1 chats
        conversation.contactId = contact.id
        conversation.contact = contact
        conversation.unreadCount = 0
        conversation.isPinned = false
        conversation.lastMessageTimestamp = Date()
        
        // Link conversation to contact
        contact.conversation = conversation
    }
    
    enum InviteError: Error, LocalizedError {
        case invalidFormat
        case invalidPayload
        case missingPeerInfo
        
        var errorDescription: String? {
            switch self {
            case .invalidFormat:
                return "Invalid invite code format"
            case .invalidPayload:
                return "Could not decode invite payload"
            case .missingPeerInfo:
                return "Missing peer information in invite"
            }
        }
    }
    
    private func isValidInviteCode(_ code: String) -> Bool {
        // Basic validation - invite code should be non-empty and reasonable length
        return code.count > 10 && code.count < 500
    }
}

// MARK: - Invite Generation View
struct InviteGenerationView: View {
    let inviteCode: String
    @State private var showShareSheet: Bool = false
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Share Your Invite")
                .font(.title)
                .fontWeight(.bold)
            
            Text("Share this code or QR code with others to connect")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            
            // QR Code
            if let qrImage = generateQRCode(from: inviteCode) {
                Image(uiImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 250, height: 250)
                    .padding()
                    .background(Color.white)
                    .cornerRadius(10)
                    .shadow(radius: 5)
            }
            
            // Invite Code Text
            VStack(alignment: .leading, spacing: 8) {
                Text("Invite Code")
                    .font(.headline)
                
                Text(inviteCode)
                    .font(.system(.body, design: .monospaced))
                    .padding()
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(8)
                    .textSelection(.enabled)
            }
            .padding(.horizontal)
            
            // Share Button
            Button(action: {
                showShareSheet = true
            }) {
                HStack {
                    Image(systemName: "square.and.arrow.up")
                    Text("Share Invite")
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(10)
            }
            .padding(.horizontal)
            .sheet(isPresented: $showShareSheet) {
                ShareSheet(items: [inviteCode])
            }
            
            Spacer()
        }
        .padding(.top, 20)
    }
    
    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        
        guard let outputImage = filter.outputImage else { return nil }
        
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return nil
        }
        
        return UIImage(cgImage: cgImage)
    }
}

// MARK: - Share Sheet
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: items,
            applicationActivities: nil
        )
        return controller
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {
        // No update needed
    }
}

struct InviteHandlingView_Previews: PreviewProvider {
    static var previews: some View {
        InviteHandlingView(
            onAccept: { code in
                print("Accepted invite: \(code)")
            },
            onDecline: {
                print("Declined invite")
            }
        )
    }
}
