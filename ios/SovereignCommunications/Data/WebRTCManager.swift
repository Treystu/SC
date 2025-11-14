//
//  WebRTCManager.swift
//  Sovereign Communications
//
//  WebRTC peer-to-peer connection manager for iOS
//

import Foundation
import WebRTC
import os.log

/// Manages WebRTC connections for peer-to-peer communication
class WebRTCManager: NSObject {
    static let shared = WebRTCManager()
    
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "WebRTC")
    
    // WebRTC factory
    private var factory: RTCPeerConnectionFactory!
    
    // Peer connections
    private var peerConnections: [String: RTCPeerConnection] = [:]
    private var dataChannels: [String: RTCDataChannel] = [:]
    
    // Configuration
    private let config: RTCConfiguration = {
        let config = RTCConfiguration()
        
        // STUN servers for NAT traversal
        config.iceServers = [
            RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun1.l.google.com:19302"]),
            RTCIceServer(urlStrings: ["stun:stun2.l.google.com:19302"])
        ]
        
        // Connection policy
        config.bundlePolicy = .balanced
        config.rtcpMuxPolicy = .require
        config.tcpCandidatePolicy = .disabled
        config.candidateNetworkPolicy = .all
        config.continualGatheringPolicy = .gatherContinually
        
        return config
    }()
    
    // Constraints
    private let constraints: RTCMediaConstraints = {
        let mandatory: [String: String] = [
            "OfferToReceiveAudio": "false",
            "OfferToReceiveVideo": "false"
        ]
        return RTCMediaConstraints(mandatoryConstraints: mandatory, optionalConstraints: nil)
    }()
    
    // Delegate
    weak var delegate: WebRTCManagerDelegate?
    
    private override init() {
        super.init()
        setupFactory()
    }
    
    // MARK: - Setup
    
    private func setupFactory() {
        // Initialize WebRTC factory
        RTCInitializeSSL()
        
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        
        factory = RTCPeerConnectionFactory(
            encoderFactory: encoderFactory,
            decoderFactory: decoderFactory
        )
        
        logger.info("WebRTC factory initialized")
    }
    
    // MARK: - Connection Management
    
    /// Create a peer connection for a peer
    func createPeerConnection(for peerId: String) -> RTCPeerConnection? {
        // Check if connection already exists
        if let existing = peerConnections[peerId] {
            logger.warning("Peer connection already exists for \(peerId)")
            return existing
        }
        
        // Create new peer connection
        guard let peerConnection = factory.peerConnection(
            with: config,
            constraints: constraints,
            delegate: nil
        ) else {
            logger.error("Failed to create peer connection")
            return nil
        }
        
        // Store connection
        peerConnections[peerId] = peerConnection
        
        // Create data channel
        let dataChannelConfig = RTCDataChannelConfiguration()
        dataChannelConfig.isOrdered = true
        dataChannelConfig.maxRetransmits = 3
        
        if let dataChannel = peerConnection.dataChannel(
            forLabel: "mesh",
            configuration: dataChannelConfig
        ) {
            dataChannel.delegate = self
            dataChannels[peerId] = dataChannel
        }
        
        logger.info("Created peer connection for \(peerId)")
        return peerConnection
    }
    
    /// Close and remove a peer connection
    func closePeerConnection(for peerId: String) {
        if let connection = peerConnections[peerId] {
            connection.close()
            peerConnections.removeValue(forKey: peerId)
        }
        
        if let channel = dataChannels[peerId] {
            channel.close()
            dataChannels.removeValue(forKey: peerId)
        }
        
        logger.info("Closed peer connection for \(peerId)")
    }
    
    // MARK: - Signaling
    
    /// Create an SDP offer
    func createOffer(for peerId: String, completion: @escaping (RTCSessionDescription?, Error?) -> Void) {
        guard let peerConnection = peerConnections[peerId] else {
            completion(nil, WebRTCError.connectionNotFound)
            return
        }
        
        peerConnection.offer(for: constraints) { sdp, error in
            if let error = error {
                self.logger.error("Failed to create offer: \(error.localizedDescription)")
                completion(nil, error)
                return
            }
            
            guard let sdp = sdp else {
                completion(nil, WebRTCError.sdpGenerationFailed)
                return
            }
            
            // Set local description
            peerConnection.setLocalDescription(sdp) { error in
                if let error = error {
                    self.logger.error("Failed to set local description: \(error.localizedDescription)")
                    completion(nil, error)
                } else {
                    self.logger.info("Created offer for \(peerId)")
                    completion(sdp, nil)
                }
            }
        }
    }
    
    /// Create an SDP answer
    func createAnswer(for peerId: String, completion: @escaping (RTCSessionDescription?, Error?) -> Void) {
        guard let peerConnection = peerConnections[peerId] else {
            completion(nil, WebRTCError.connectionNotFound)
            return
        }
        
        peerConnection.answer(for: constraints) { sdp, error in
            if let error = error {
                self.logger.error("Failed to create answer: \(error.localizedDescription)")
                completion(nil, error)
                return
            }
            
            guard let sdp = sdp else {
                completion(nil, WebRTCError.sdpGenerationFailed)
                return
            }
            
            // Set local description
            peerConnection.setLocalDescription(sdp) { error in
                if let error = error {
                    self.logger.error("Failed to set local description: \(error.localizedDescription)")
                    completion(nil, error)
                } else {
                    self.logger.info("Created answer for \(peerId)")
                    completion(sdp, nil)
                }
            }
        }
    }
    
    /// Set remote SDP
    func setRemoteDescription(for peerId: String, sdp: RTCSessionDescription, completion: @escaping (Error?) -> Void) {
        guard let peerConnection = peerConnections[peerId] else {
            completion(WebRTCError.connectionNotFound)
            return
        }
        
        peerConnection.setRemoteDescription(sdp) { error in
            if let error = error {
                self.logger.error("Failed to set remote description: \(error.localizedDescription)")
            } else {
                self.logger.info("Set remote description for \(peerId)")
            }
            completion(error)
        }
    }
    
    /// Add ICE candidate
    func addIceCandidate(for peerId: String, candidate: RTCIceCandidate) {
        guard let peerConnection = peerConnections[peerId] else {
            logger.error("Cannot add ICE candidate - connection not found")
            return
        }
        
        peerConnection.add(candidate) { error in
            if let error = error {
                self.logger.error("Failed to add ICE candidate: \(error.localizedDescription)")
            } else {
                self.logger.debug("Added ICE candidate for \(peerId)")
            }
        }
    }
    
    // MARK: - Data Channel
    
    /// Send data through data channel
    func send(data: Data, to peerId: String) -> Bool {
        guard let dataChannel = dataChannels[peerId],
              dataChannel.readyState == .open else {
            logger.error("Cannot send data - channel not open")
            return false
        }
        
        let buffer = RTCDataBuffer(data: data, isBinary: true)
        let success = dataChannel.sendData(buffer)
        
        if success {
            logger.debug("Sent \(data.count) bytes to \(peerId)")
        } else {
            logger.error("Failed to send data to \(peerId)")
        }
        
        return success
    }
    
    /// Get connection state
    func getConnectionState(for peerId: String) -> RTCPeerConnectionState? {
        return peerConnections[peerId]?.connectionState
    }
    
    /// Get ICE connection state
    func getIceConnectionState(for peerId: String) -> RTCIceConnectionState? {
        return peerConnections[peerId]?.iceConnectionState
    }
}

// MARK: - RTCDataChannelDelegate

extension WebRTCManager: RTCDataChannelDelegate {
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        logger.info("Data channel state changed: \(dataChannel.readyState.description)")
        
        // Find peer ID for this channel
        let peerId = dataChannels.first { $0.value == dataChannel }?.key
        
        switch dataChannel.readyState {
        case .open:
            if let peerId = peerId {
                delegate?.webRTCManager(self, didOpenDataChannelFor: peerId)
            }
        case .closed:
            if let peerId = peerId {
                delegate?.webRTCManager(self, didCloseDataChannelFor: peerId)
            }
        default:
            break
        }
    }
    
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
        logger.debug("Received \(buffer.data.count) bytes")
        
        // Find peer ID for this channel
        if let peerId = dataChannels.first(where: { $0.value == dataChannel })?.key {
            delegate?.webRTCManager(self, didReceiveData: buffer.data, from: peerId)
        }
    }
}

// MARK: - Delegate Protocol

protocol WebRTCManagerDelegate: AnyObject {
    func webRTCManager(_ manager: WebRTCManager, didReceiveData data: Data, from peerId: String)
    func webRTCManager(_ manager: WebRTCManager, didOpenDataChannelFor peerId: String)
    func webRTCManager(_ manager: WebRTCManager, didCloseDataChannelFor peerId: String)
    func webRTCManager(_ manager: WebRTCManager, didGenerateIceCandidate candidate: RTCIceCandidate, for peerId: String)
}

// MARK: - Errors

enum WebRTCError: Error {
    case connectionNotFound
    case sdpGenerationFailed
    case dataChannelNotOpen
    
    var localizedDescription: String {
        switch self {
        case .connectionNotFound:
            return "Peer connection not found"
        case .sdpGenerationFailed:
            return "Failed to generate SDP"
        case .dataChannelNotOpen:
            return "Data channel is not open"
        }
    }
}

// MARK: - RTCDataChannelState Extension

extension RTCDataChannelState {
    var description: String {
        switch self {
        case .connecting: return "connecting"
        case .open: return "open"
        case .closing: return "closing"
        case .closed: return "closed"
        @unknown default: return "unknown"
        }
    }
}

// MARK: - RTCPeerConnectionState Extension

extension RTCPeerConnectionState {
    var description: String {
        switch self {
        case .new: return "new"
        case .connecting: return "connecting"
        case .connected: return "connected"
        case .disconnected: return "disconnected"
        case .failed: return "failed"
        case .closed: return "closed"
        @unknown default: return "unknown"
        }
    }
}
