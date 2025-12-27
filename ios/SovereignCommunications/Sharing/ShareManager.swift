//
//  ShareManager.swift
//  Sovereign Communications
//
//  iOS native sharing implementation with Share Sheet, QR, and local network support
//

import UIKit
import CoreImage.CIFilterBuiltins

/// Invite data structure for sharing
struct Invite: Codable {
    let code: String
    let inviterName: String?
    let inviterPeerId: String
    let createdAt: Date
    let expiresAt: Date
    let signature: Data
    
    /// Generate shareable text
    func toShareText() -> String {
        return """
        Join me on Sovereign Communications!
        
        Secure, decentralized messaging with no servers.
        
        Invite code: \(code)
        """
    }
    
    /// Generate shareable URL
    func toShareURL() -> URL? {
        var components = URLComponents(string: "https://sc.app/join")
        components?.queryItems = [
            URLQueryItem(name: "code", value: code)
        ]
        if let name = inviterName {
            components?.queryItems?.append(URLQueryItem(name: "inviterName", value: name))
        }
        return components?.url
    }
    
    /// Generate custom scheme URL for deep linking
    func toCustomSchemeURL() -> URL? {
        return URL(string: "sc://join/\(code)")
    }
}

/// Manages native iOS sharing functionality
class ShareManager {
    static let shared = ShareManager()
    
    private init() {}

    /// Create a signed invite
    func createSignedInvite(code: String, inviterName: String?, inviterPeerId: String, createdAt: Date, expiresAt: Date) -> Invite? {
        // Prepare data to sign: code + inviterPeerId + createdAt (as timestamp)
        let dataToSign = (code + inviterPeerId + String(Int(createdAt.timeIntervalSince1970))).data(using: .utf8) ?? Data()
        guard let signature = IdentityManager.shared.sign(data: dataToSign) else { return nil }
        return Invite(
            code: code,
            inviterName: inviterName,
            inviterPeerId: inviterPeerId,
            createdAt: createdAt,
            expiresAt: expiresAt,
            signature: signature
        )
    }
    
    // MARK: - Share Sheet Integration
    
    /// Share app invite using native iOS share sheet
    /// - Parameters:
    ///   - invite: The invite to share
    ///   - viewController: The presenting view controller
    ///   - sourceView: Optional source view for iPad popover presentation
    func shareApp(invite: Invite, from viewController: UIViewController, sourceView: UIView? = nil) {
        let shareText = invite.toShareText()
        
        var items: [Any] = [shareText]
        
        // Add URL if available
        if let shareURL = invite.toShareURL() {
            items.append(shareURL)
        }
        
        // Add QR code image
        if let qrImage = generateQRCode(for: invite.code) {
            items.append(qrImage)
        }
        
        let activityVC = UIActivityViewController(
            activityItems: items,
            applicationActivities: [
                QRCodeActivity(invite: invite)
            ]
        )
        
        // Exclude irrelevant activities
        activityVC.excludedActivityTypes = [
            .addToReadingList,
            .assignToContact,
            .saveToCameraRoll,
            .openInIBooks
        ]
        
        // Configure popover for iPad
        if let popoverController = activityVC.popoverPresentationController {
            popoverController.sourceView = sourceView ?? viewController.view
            if let sourceView = sourceView {
                popoverController.sourceRect = sourceView.bounds
            } else {
                popoverController.sourceRect = CGRect(
                    x: viewController.view.bounds.midX,
                    y: viewController.view.bounds.midY,
                    width: 0,
                    height: 0
                )
            }
        }
        
        viewController.present(activityVC, animated: true)
    }
    
    /// Share peer info using native share sheet
    /// - Parameters:
    ///   - peerInfo: The peer info to share (from QRCodeScannerView module)
    ///   - viewController: The presenting view controller
    func sharePeerInfo(_ peerInfo: PeerInfo, from viewController: UIViewController) {
        let shareText = """
        Connect with me on Sovereign Communications!
        
        Peer ID: \(peerInfo.id)
        """
        
        var items: [Any] = [shareText]
        
        // Add QR code
        if let qrImage = generateQRCode(for: peerInfo.toQRString()) {
            items.append(qrImage)
        }
        
        let activityVC = UIActivityViewController(
            activityItems: items,
            applicationActivities: nil
        )
        
        activityVC.excludedActivityTypes = [
            .addToReadingList,
            .assignToContact
        ]
        
        viewController.present(activityVC, animated: true)
    }
    
    // MARK: - QR Code Generation
    
    /// Generate a QR code image for the given string
    /// - Parameter string: The string to encode
    /// - Returns: UIImage of the QR code, or nil if generation fails
    func generateQRCode(for string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        
        filter.message = Data(string.utf8)
        filter.correctionLevel = "H"  // High error correction (~30% recovery) for better scanning reliability
        
        guard let outputImage = filter.outputImage else { return nil }
        
        // Scale up for better resolution
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return nil
        }
        
        return UIImage(cgImage: cgImage)
    }
    
    // MARK: - URL Handling
    
    /// Handle incoming URL for invite processing
    /// - Parameter url: The URL to process
    /// - Returns: The extracted invite code, or nil if not an invite URL
    func handleIncomingURL(_ url: URL) -> String? {
        // Handle custom scheme: sc://join/CODE
        // Ensure there are at least 3 path components: ["/", "join", "CODE"]
        if url.scheme == "sc" && url.host == "join" {
            // pathComponents for "sc://join/ABC123" would be ["/", "ABC123"]
            // We need to ensure there's an actual code after the host
            if url.pathComponents.count >= 2,
               let code = url.pathComponents.last,
               !code.isEmpty && code != "/" {
                return code
            }
            return nil
        }
        
        // Handle HTTPS: https://sc.app/join?code=CODE
        if url.host == "sc.app" && url.path == "/join" {
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            return components?.queryItems?.first(where: { $0.name == "code" })?.value
        }
        
        // Handle hash-based: https://sc.app/join#CODE
        if url.host == "sc.app" && url.path == "/join" && url.fragment != nil {
            return url.fragment
        }
        
        return nil
    }
    
    /// Check if a URL is an invite URL
    /// - Parameter url: The URL to check
    /// - Returns: True if the URL is an invite URL
    func isInviteURL(_ url: URL) -> Bool {
        return handleIncomingURL(url) != nil
    }
}

// MARK: - Custom Activity: QR Code

/// Custom UIActivity for displaying QR code
class QRCodeActivity: UIActivity {
    private let invite: Invite
    
    init(invite: Invite) {
        self.invite = invite
        super.init()
    }
    
    override class var activityCategory: UIActivity.Category {
        return .share
    }
    
    override var activityType: UIActivity.ActivityType? {
        return UIActivity.ActivityType("com.sc.share.qrcode")
    }
    
    override var activityTitle: String? {
        return "Show QR Code"
    }
    
    override var activityImage: UIImage? {
        return UIImage(systemName: "qrcode")
    }
    
    override func canPerform(withActivityItems activityItems: [Any]) -> Bool {
        return true
    }
    
    override func prepare(withActivityItems activityItems: [Any]) {
        // Prepare for activity
    }
    
    override func perform() {
        // Show QR code in a new view controller
        DispatchQueue.main.async {
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let rootVC = windowScene.windows.first?.rootViewController {
                let qrVC = QRCodeDisplayViewController(invite: self.invite)
                let navVC = UINavigationController(rootViewController: qrVC)
                navVC.modalPresentationStyle = .pageSheet
                rootVC.present(navVC, animated: true)
            }
        }
        activityDidFinish(true)
    }
}

// MARK: - QR Code Display View Controller

/// View controller for displaying QR code full screen
class QRCodeDisplayViewController: UIViewController {
    private let invite: Invite
    private var qrImageView: UIImageView!
    private var titleLabel: UILabel!
    private var codeLabel: UILabel!
    
    init(invite: Invite) {
        self.invite = invite
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        
        title = "Scan to Connect"
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done,
            target: self,
            action: #selector(dismissView)
        )
        
        // Title label
        titleLabel = UILabel()
        titleLabel.text = "Share this QR code"
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)
        
        // QR Code image
        qrImageView = UIImageView()
        qrImageView.contentMode = .scaleAspectFit
        qrImageView.translatesAutoresizingMaskIntoConstraints = false
        qrImageView.layer.cornerRadius = 12
        qrImageView.layer.masksToBounds = true
        qrImageView.backgroundColor = .white
        view.addSubview(qrImageView)
        
        // Code label
        codeLabel = UILabel()
        codeLabel.text = "Code: \(String(invite.code.prefix(16)))..."
        codeLabel.font = .preferredFont(forTextStyle: .caption1)
        codeLabel.textAlignment = .center
        codeLabel.textColor = .secondaryLabel
        codeLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(codeLabel)
        
        // Generate and display QR code
        if let qrImage = ShareManager.shared.generateQRCode(for: invite.code) {
            qrImageView.image = qrImage
        }
        
        // Constraints
        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 40),
            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            
            qrImageView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            qrImageView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            qrImageView.widthAnchor.constraint(equalToConstant: 280),
            qrImageView.heightAnchor.constraint(equalToConstant: 280),
            
            codeLabel.topAnchor.constraint(equalTo: qrImageView.bottomAnchor, constant: 20),
            codeLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            codeLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20)
        ])
    }
    
    @objc private func dismissView() {
        dismiss(animated: true)
    }
}

// MARK: - SwiftUI Bridge

import SwiftUI

/// SwiftUI wrapper for ShareManager
struct ShareManagerView: UIViewControllerRepresentable {
    let invite: Invite
    @Environment(\.dismiss) var dismiss
    
    func makeUIViewController(context: Context) -> UIViewController {
        let vc = UIViewController()
        DispatchQueue.main.async {
            ShareManager.shared.shareApp(invite: invite, from: vc)
        }
        return vc
    }
    
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
