import SwiftUI
import AVFoundation
import CoreImage.CIFilterBuiltins

struct QRScannerView: View {
    @Environment(\.presentationMode) var presentationMode
    let onScanComplete: (String) -> Void
    
    @State private var isScanning = false
    @State private var isPermissionDenied = false
    @State private var errorMessage: String = ""
    @State private var showError = false
    
    var body: some View {
        NavigationView {
            VStack {
                Text("Scan QR Code")
                    .font(.title)
                    .fontWeight(.bold)
                    .padding()
                
                Text("Position the QR code within the frame to scan")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                
                if isPermissionDenied {
                    VStack {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.red)
                        
                        Text("Camera Access Denied")
                            .font(.headline)
                            .foregroundColor(.red)
                        
                        Text("Please enable camera access in Settings to scan QR codes")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        Button("Open Settings") {
                            if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(settingsUrl)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tinted(.red)
                    }
                    .padding()
                } else if showError {
                    VStack {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.red)
                        
                        Text("Scanning Error")
                            .font(.headline)
                            .foregroundColor(.red)
                        
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        Button("Try Again") {
                            startScanning()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                } else {
                    CameraView(
                        onScanComplete: { code in
                            onScanComplete(code)
                            presentationMode.wrappedValue.dismiss()
                        },
                        onError: { error in
                            errorMessage = error
                            showError = true
                        }
                    )
                    .frame(height: 300)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue, lineWidth: 2)
                            .frame(height: 300)
                    )
                }
                
                Spacer()
                
                Button("Cancel") {
                    presentationMode.wrappedValue.dismiss()
                }
                .buttonStyle(.bordered)
                .padding()
            }
            .navigationBarItems(trailing: Button("Cancel") {
                presentationMode.wrappedValue.dismiss()
            })
        }
        .onAppear {
            requestCameraPermission()
        }
    }
    
    private func requestCameraPermission() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                if granted {
                    startScanning()
                } else {
                    isPermissionDenied = true
                }
            }
        }
    }
    
    private func startScanning() {
        isPermissionDenied = false
        showError = false
        isScanning = true
    }
}

// MARK: - Camera View
struct CameraView: UIViewRepresentable {
    let onScanComplete: (String) -> Void
    let onError: (String) -> Void
    
    func makeUIView(context: Context) -> UIView {
        let cameraView = UIView()
        
        // For V1.0, we'll use a placeholder implementation
        // In a real implementation, you would:
        // 1. Set up AVCaptureSession
        // 2. Configure camera input
        // 3. Add QR code detection
        // 4. Handle scan completion
        
        // Placeholder implementation for V1.0
        DispatchQueue.main.asyncAfter(deadline: 2.0) {
            // Simulate a successful scan for demo purposes
            let demoCode = "DEMO-INVITE-CODE-123456"
            onScanComplete(demoCode)
        }
        
        return cameraView
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        // Update camera view if needed
    }
}
