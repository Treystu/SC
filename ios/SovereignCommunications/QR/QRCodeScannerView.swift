//
//  QRCodeScannerView.swift
//  Sovereign Communications
//
//  QR Code scanner using AVFoundation
//

import SwiftUI
import AVFoundation

struct QRCodeScannerView: View {
    @Environment(\.dismiss) var dismiss
    @State private var isScanning = true
    @State private var scannedData: String?
    @State private var showError = false
    @State private var errorMessage = ""
    
    let onCodeScanned: (String) -> Void
    
    var body: some View {
        ZStack {
            CameraView(
                isScanning: $isScanning,
                scannedData: $scannedData,
                onError: { error in
                    errorMessage = error
                    showError = true
                }
            )
            .edgesIgnoringSafeArea(.all)
            
            VStack {
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.title2)
                            .foregroundColor(.white)
                            .padding()
                            .background(Color.black.opacity(0.6))
                            .clipShape(Circle())
                    }
                    .padding()
                    
                    Spacer()
                }
                
                Spacer()
                
                // Scanning frame
                Rectangle()
                    .strokeBorder(Color.green, lineWidth: 3)
                    .frame(width: 250, height: 250)
                    .overlay(
                        VStack {
                            Spacer()
                            Text("Scan QR Code")
                                .font(.headline)
                                .foregroundColor(.white)
                                .padding(8)
                                .background(Color.black.opacity(0.6))
                                .cornerRadius(8)
                                .padding(.bottom, -40)
                        }
                    )
                
                Spacer()
            }
        }
        .onChange(of: scannedData) { newValue in
            if let data = newValue, !data.isEmpty {
                isScanning = false
                onCodeScanned(data)
                dismiss()
            }
        }
        .alert("Scanner Error", isPresented: $showError) {
            Button("OK") { dismiss() }
        } message: {
            Text(errorMessage)
        }
    }
}

struct CameraView: UIViewRepresentable {
    @Binding var isScanning: Bool
    @Binding var scannedData: String?
    let onError: (String) -> Void
    
    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .black
        
        let captureSession = AVCaptureSession()
        
        guard let videoCaptureDevice = AVCaptureDevice.default(for: .video) else {
            onError("No camera available")
            return view
        }
        
        do {
            let videoInput = try AVCaptureDeviceInput(device: videoCaptureDevice)
            
            if captureSession.canAddInput(videoInput) {
                captureSession.addInput(videoInput)
            } else {
                onError("Could not add video input")
                return view
            }
            
            let metadataOutput = AVCaptureMetadataOutput()
            
            if captureSession.canAddOutput(metadataOutput) {
                captureSession.addOutput(metadataOutput)
                
                metadataOutput.setMetadataObjectsDelegate(context.coordinator, queue: DispatchQueue.main)
                metadataOutput.metadataObjectTypes = [.qr]
            } else {
                onError("Could not add metadata output")
                return view
            }
            
            let previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
            previewLayer.frame = view.layer.bounds
            previewLayer.videoGravity = .resizeAspectFill
            view.layer.addSublayer(previewLayer)
            
            context.coordinator.captureSession = captureSession
            context.coordinator.previewLayer = previewLayer
            
            DispatchQueue.global(qos: .userInitiated).async {
                captureSession.startRunning()
            }
            
        } catch {
            onError("Could not create video input: \(error.localizedDescription)")
        }
        
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.previewLayer?.frame = uiView.layer.bounds
        
        if isScanning {
            if context.coordinator.captureSession?.isRunning == false {
                DispatchQueue.global(qos: .userInitiated).async {
                    context.coordinator.captureSession?.startRunning()
                }
            }
        } else {
            if context.coordinator.captureSession?.isRunning == true {
                DispatchQueue.global(qos: .userInitiated).async {
                    context.coordinator.captureSession?.stopRunning()
                }
            }
        }
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(scannedData: $scannedData)
    }
    
    class Coordinator: NSObject, AVCaptureMetadataOutputObjectsDelegate {
        @Binding var scannedData: String?
        var captureSession: AVCaptureSession?
        var previewLayer: AVCaptureVideoPreviewLayer?
        
        init(scannedData: Binding<String?>) {
            _scannedData = scannedData
        }
        
        func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
            if let metadataObject = metadataObjects.first {
                guard let readableObject = metadataObject as? AVMetadataMachineReadableCodeObject else { return }
                guard let stringValue = readableObject.stringValue else { return }
                
                AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
                scannedData = stringValue
            }
        }
    }
}

struct QRCodeDisplayView: View {
    let peerInfo: PeerInfo
    @State private var qrImage: UIImage?
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Your Peer Identity")
                .font(.title2)
                .fontWeight(.bold)
            
            if let qrImage = qrImage {
                Image(uiImage: qrImage)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 300, height: 300)
                    .padding()
                    .background(Color.white)
                    .cornerRadius(12)
                    .shadow(radius: 5)
            } else {
                ProgressView()
                    .frame(width: 300, height: 300)
            }
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Peer ID:")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Text(peerInfo.id.prefix(16) + "...")
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(8)
            
            Button(action: sharePeerInfo) {
                Label("Share Peer Info", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal)
        }
        .padding()
        .onAppear {
            generateQRCode()
        }
    }
    
    private func generateQRCode() {
        let data = peerInfo.toQRString().data(using: .utf8)
        let filter = CIFilter(name: "CIQRCodeGenerator")
        filter?.setValue(data, forKey: "inputMessage")
        filter?.setValue("H", forKey: "inputCorrectionLevel")
        
        if let outputImage = filter?.outputImage {
            let transform = CGAffineTransform(scaleX: 10, y: 10)
            let scaledImage = outputImage.transformed(by: transform)
            let context = CIContext()
            
            if let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) {
                qrImage = UIImage(cgImage: cgImage)
            }
        }
    }
    
    private func sharePeerInfo() {
        let text = peerInfo.toQRString()
        let activityVC = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            rootVC.present(activityVC, animated: true)
        }
    }
}

// Peer info model for QR code
struct PeerInfo: Codable {
    let id: String
    let publicKey: String
    let endpoints: [String]
    
    func toQRString() -> String {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(self),
           let jsonString = String(data: data, encoding: .utf8) {
            return jsonString
        }
        return ""
    }
    
    static func fromQRString(_ string: String) -> PeerInfo? {
        guard let data = string.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()
        return try? decoder.decode(PeerInfo.self, from: data)
    }
}
