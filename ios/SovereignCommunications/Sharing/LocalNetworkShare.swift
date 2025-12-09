//
//  LocalNetworkShare.swift
//  Sovereign Communications
//
//  Local network peer discovery using MultipeerConnectivity
//

import Foundation
import MultipeerConnectivity

/// Delegate protocol for local network share events
protocol LocalNetworkShareDelegate: AnyObject {
    func localNetworkShare(_ share: LocalNetworkShare, didDiscoverPeer peerId: MCPeerID, withInfo info: [String: String]?)
    func localNetworkShare(_ share: LocalNetworkShare, didLosePeer peerId: MCPeerID)
    func localNetworkShare(_ share: LocalNetworkShare, didReceiveInvite invite: String, from peerId: MCPeerID)
    func localNetworkShare(_ share: LocalNetworkShare, didConnectToPeer peerId: MCPeerID)
    func localNetworkShare(_ share: LocalNetworkShare, didDisconnectFromPeer peerId: MCPeerID)
}

/// Response structure for invite acceptance
struct InviteResponse: Codable {
    let accepted: Bool
    let peerId: String
    let publicKey: String?
}

/// Manages local network discovery and sharing via MultipeerConnectivity
class LocalNetworkShare: NSObject {
    // MARK: - Properties
    
    private let serviceType = "sc-app-share"
    private var myPeerID: MCPeerID
    private var session: MCSession?
    private var advertiser: MCNearbyServiceAdvertiser?
    private var browser: MCNearbyServiceBrowser?
    
    private var currentInvite: Invite?
    private var discoveryInfo: [String: String]?
    
    weak var delegate: LocalNetworkShareDelegate?
    
    /// Track discovered peers
    private(set) var discoveredPeers: [MCPeerID] = []
    
    /// Track connected peers
    private(set) var connectedPeers: [MCPeerID] = []
    
    // MARK: - Initialization
    
    init(displayName: String) {
        self.myPeerID = MCPeerID(displayName: displayName)
        super.init()
        setupSession()
    }
    
    private func setupSession() {
        session = MCSession(
            peer: myPeerID,
            securityIdentity: nil,
            encryptionPreference: .required
        )
        session?.delegate = self
    }
    
    // MARK: - Public Methods
    
    /// Start sharing an invite on local network
    /// - Parameter invite: The invite to share
    func startSharing(invite: Invite) {
        currentInvite = invite
        
        // Build discovery info
        discoveryInfo = [
            "inviteCode": invite.code,
            "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        ]
        
        if let name = invite.inviterName {
            discoveryInfo?["inviterName"] = name
        }
        
        // Start advertising
        advertiser = MCNearbyServiceAdvertiser(
            peer: myPeerID,
            discoveryInfo: discoveryInfo,
            serviceType: serviceType
        )
        advertiser?.delegate = self
        advertiser?.startAdvertisingPeer()
        
        print("✅ Started local network sharing for invite: \(String(invite.code.prefix(8)))...")
    }
    
    /// Stop sharing
    func stopSharing() {
        advertiser?.stopAdvertisingPeer()
        advertiser = nil
        currentInvite = nil
        discoveryInfo = nil
        print("⏹️ Stopped local network sharing")
    }
    
    /// Start browsing for nearby peers sharing invites
    func startBrowsing() {
        browser = MCNearbyServiceBrowser(
            peer: myPeerID,
            serviceType: serviceType
        )
        browser?.delegate = self
        browser?.startBrowsingForPeers()
        
        print("🔍 Started browsing for local peers")
    }
    
    /// Stop browsing
    func stopBrowsing() {
        browser?.stopBrowsingForPeers()
        browser = nil
        discoveredPeers.removeAll()
        print("⏹️ Stopped browsing for local peers")
    }
    
    /// Invite a discovered peer to connect
    /// - Parameter peer: The peer to invite
    func invitePeer(_ peer: MCPeerID) {
        guard let session = session else { return }
        
        browser?.invitePeer(
            peer,
            to: session,
            withContext: nil,
            timeout: 30
        )
    }
    
    /// Send data to connected peers
    /// - Parameters:
    ///   - data: The data to send
    ///   - peers: The peers to send to (nil = all connected peers)
    func send(data: Data, to peers: [MCPeerID]? = nil) {
        guard let session = session else { return }
        
        let targetPeers = peers ?? session.connectedPeers
        
        if !targetPeers.isEmpty {
            do {
                try session.send(data, toPeers: targetPeers, with: .reliable)
            } catch {
                print("❌ Failed to send data: \(error.localizedDescription)")
            }
        }
    }
    
    /// Send invite data to a connected peer
    /// - Parameter peer: The peer to send to
    func sendInvite(to peer: MCPeerID) {
        guard let invite = currentInvite else { return }
        
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(invite) {
            send(data: data, to: [peer])
        }
    }
    
    /// Disconnect from all peers
    func disconnect() {
        session?.disconnect()
        connectedPeers.removeAll()
    }
    
    /// Cleanup all resources
    func cleanup() {
        stopSharing()
        stopBrowsing()
        disconnect()
    }
}

// MARK: - MCSessionDelegate

extension LocalNetworkShare: MCSessionDelegate {
    func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
        DispatchQueue.main.async {
            switch state {
            case .connected:
                print("✅ Connected to peer: \(peerID.displayName)")
                if !self.connectedPeers.contains(peerID) {
                    self.connectedPeers.append(peerID)
                }
                self.delegate?.localNetworkShare(self, didConnectToPeer: peerID)
                
                // Auto-send invite if we're advertising
                if self.currentInvite != nil {
                    self.sendInvite(to: peerID)
                }
                
            case .connecting:
                print("🔄 Connecting to peer: \(peerID.displayName)")
                
            case .notConnected:
                print("❌ Disconnected from peer: \(peerID.displayName)")
                self.connectedPeers.removeAll { $0 == peerID }
                self.delegate?.localNetworkShare(self, didDisconnectFromPeer: peerID)
                
            @unknown default:
                print("⚠️ Unknown state for peer: \(peerID.displayName)")
            }
        }
    }
    
    func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
        DispatchQueue.main.async {
            let decoder = JSONDecoder()
            
            // Try to decode as Invite
            if let invite = try? decoder.decode(Invite.self, from: data) {
                print("📨 Received invite from \(peerID.displayName)")
                self.delegate?.localNetworkShare(self, didReceiveInvite: invite.code, from: peerID)
                return
            }
            
            // Try to decode as InviteResponse
            if let response = try? decoder.decode(InviteResponse.self, from: data) {
                print("📨 Received invite response from \(peerID.displayName): accepted=\(response.accepted)")
                return
            }
            
            print("📨 Received unknown data from \(peerID.displayName)")
        }
    }
    
    func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {
        // Not used in this implementation
    }
    
    func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {
        // Not used in this implementation
    }
    
    func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {
        // Not used in this implementation
    }
}

// MARK: - MCNearbyServiceAdvertiserDelegate

extension LocalNetworkShare: MCNearbyServiceAdvertiserDelegate {
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
        print("📲 Received connection request from \(peerID.displayName)")
        
        // Auto-accept connections when sharing
        invitationHandler(true, session)
    }
    
    func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
        print("❌ Failed to start advertising: \(error.localizedDescription)")
    }
}

// MARK: - MCNearbyServiceBrowserDelegate

extension LocalNetworkShare: MCNearbyServiceBrowserDelegate {
    func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
        print("🔍 Found peer: \(peerID.displayName)")
        
        DispatchQueue.main.async {
            if !self.discoveredPeers.contains(peerID) {
                self.discoveredPeers.append(peerID)
            }
            self.delegate?.localNetworkShare(self, didDiscoverPeer: peerID, withInfo: info)
        }
    }
    
    func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
        print("👋 Lost peer: \(peerID.displayName)")
        
        DispatchQueue.main.async {
            self.discoveredPeers.removeAll { $0 == peerID }
            self.delegate?.localNetworkShare(self, didLosePeer: peerID)
        }
    }
    
    func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
        print("❌ Failed to start browsing: \(error.localizedDescription)")
    }
}

// MARK: - SwiftUI View for Local Network Discovery

import SwiftUI

/// SwiftUI view for local network peer discovery
struct LocalNetworkDiscoveryView: View {
    @StateObject private var viewModel = LocalNetworkDiscoveryViewModel()
    @Environment(\.dismiss) var dismiss
    
    let onPeerSelected: (String, String?) -> Void
    
    var body: some View {
        NavigationView {
            List {
                if viewModel.isSearching {
                    Section {
                        HStack {
                            ProgressView()
                                .padding(.trailing, 8)
                            Text("Searching for nearby devices...")
                                .foregroundColor(.secondary)
                        }
                    }
                }
                
                if !viewModel.discoveredPeers.isEmpty {
                    Section(header: Text("Nearby Devices")) {
                        ForEach(viewModel.discoveredPeers, id: \.peerId) { peer in
                            Button(action: {
                                viewModel.connectToPeer(peer.peerId)
                            }) {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(peer.displayName)
                                            .font(.headline)
                                        if let inviterName = peer.info?["inviterName"] {
                                            Text("Shared by \(inviterName)")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                    
                                    Spacer()
                                    
                                    if peer.isConnecting {
                                        ProgressView()
                                    } else {
                                        Image(systemName: "chevron.right")
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        }
                    }
                } else if !viewModel.isSearching {
                    Section {
                        Text("No nearby devices found")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
            .navigationTitle("Local Network")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .primaryAction) {
                    Button(viewModel.isSearching ? "Stop" : "Search") {
                        if viewModel.isSearching {
                            viewModel.stopSearching()
                        } else {
                            viewModel.startSearching()
                        }
                    }
                }
            }
            .onAppear {
                viewModel.startSearching()
            }
            .onDisappear {
                viewModel.stopSearching()
            }
            .onChange(of: viewModel.receivedInviteCode) { newValue in
                if let code = newValue, let peer = viewModel.connectedPeer {
                    onPeerSelected(code, peer.displayName)
                    dismiss()
                }
            }
        }
    }
}

/// Discovered peer model
struct DiscoveredPeer: Identifiable {
    let id = UUID()
    let peerId: MCPeerID
    let displayName: String
    let info: [String: String]?
    var isConnecting: Bool = false
}

/// View model for local network discovery
class LocalNetworkDiscoveryViewModel: NSObject, ObservableObject {
    @Published var discoveredPeers: [DiscoveredPeer] = []
    @Published var isSearching = false
    @Published var receivedInviteCode: String?
    @Published var connectedPeer: MCPeerID?
    
    private var localNetworkShare: LocalNetworkShare?
    
    override init() {
        super.init()
        let displayName = UIDevice.current.name
        localNetworkShare = LocalNetworkShare(displayName: displayName)
        localNetworkShare?.delegate = self
    }
    
    func startSearching() {
        isSearching = true
        discoveredPeers.removeAll()
        localNetworkShare?.startBrowsing()
    }
    
    func stopSearching() {
        isSearching = false
        localNetworkShare?.stopBrowsing()
    }
    
    func connectToPeer(_ peer: MCPeerID) {
        // Update UI to show connecting
        if let index = discoveredPeers.firstIndex(where: { $0.peerId == peer }) {
            discoveredPeers[index].isConnecting = true
        }
        localNetworkShare?.invitePeer(peer)
    }
}

extension LocalNetworkDiscoveryViewModel: LocalNetworkShareDelegate {
    func localNetworkShare(_ share: LocalNetworkShare, didDiscoverPeer peerId: MCPeerID, withInfo info: [String: String]?) {
        let peer = DiscoveredPeer(
            peerId: peerId,
            displayName: peerId.displayName,
            info: info
        )
        discoveredPeers.append(peer)
    }
    
    func localNetworkShare(_ share: LocalNetworkShare, didLosePeer peerId: MCPeerID) {
        discoveredPeers.removeAll { $0.peerId == peerId }
    }
    
    func localNetworkShare(_ share: LocalNetworkShare, didReceiveInvite invite: String, from peerId: MCPeerID) {
        connectedPeer = peerId
        receivedInviteCode = invite
    }
    
    func localNetworkShare(_ share: LocalNetworkShare, didConnectToPeer peerId: MCPeerID) {
        // Update UI to show connected
        if let index = discoveredPeers.firstIndex(where: { $0.peerId == peerId }) {
            discoveredPeers[index].isConnecting = false
        }
    }
    
    func localNetworkShare(_ share: LocalNetworkShare, didDisconnectFromPeer peerId: MCPeerID) {
        // Update UI
        if let index = discoveredPeers.firstIndex(where: { $0.peerId == peerId }) {
            discoveredPeers[index].isConnecting = false
        }
    }
}
