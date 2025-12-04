import SwiftUI
import CoreImage.CIFilterBuiltins

struct InviteHandlingView: View {
    @State private var inviteCode: String = ""
    @State private var isProcessing: Bool = false
    @State private var showError: Bool = false
    @State private var errorMessage: String = ""
    @State private var showSuccess: Bool = false
    
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
                    // Open QR code scanner
                    // This would integrate with PeerDiscoveryView
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
        
        // Process the invite
        onAccept(inviteCode)
        
        // Simulate processing delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            isProcessing = false
            showSuccess = true
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
