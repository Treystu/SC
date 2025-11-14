//
//  AudioSessionManager.swift
//  Sovereign Communications
//
//  Manages AVAudioSession configuration for voice messages and calls
//

import Foundation
import AVFoundation
import os.log

/// Manages audio session configuration and state
class AudioSessionManager {
    static let shared = AudioSessionManager()
    
    private let audioSession = AVAudioSession.sharedInstance()
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "Audio")
    
    private init() {
        setupNotifications()
    }
    
    // MARK: - Setup
    
    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: audioSession
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: audioSession
        )
    }
    
    // MARK: - Configuration
    
    /// Configure audio session for recording voice messages
    func configureForRecording() throws {
        try audioSession.setCategory(.record, mode: .default, options: [])
        try audioSession.setActive(true)
        logger.info("Audio session configured for recording")
    }
    
    /// Configure audio session for playback
    func configureForPlayback() throws {
        try audioSession.setCategory(.playback, mode: .default, options: [])
        try audioSession.setActive(true)
        logger.info("Audio session configured for playback")
    }
    
    /// Configure audio session for voice calls
    func configureForVoiceCall() throws {
        try audioSession.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetooth, .defaultToSpeaker]
        )
        try audioSession.setActive(true)
        logger.info("Audio session configured for voice call")
    }
    
    /// Configure audio session for background audio
    func configureForBackgroundAudio() throws {
        try audioSession.setCategory(
            .playback,
            mode: .default,
            options: [.mixWithOthers]
        )
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        logger.info("Audio session configured for background audio")
    }
    
    /// Deactivate audio session
    func deactivate() throws {
        try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        logger.info("Audio session deactivated")
    }
    
    // MARK: - Permissions
    
    /// Request microphone permission
    func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        audioSession.requestRecordPermission { granted in
            DispatchQueue.main.async {
                self.logger.info("Microphone permission: \(granted ? "granted" : "denied")")
                completion(granted)
            }
        }
    }
    
    /// Check microphone permission status
    var hasMicrophonePermission: Bool {
        return audioSession.recordPermission == .granted
    }
    
    // MARK: - Audio Route
    
    /// Get current audio route description
    var currentRoute: AVAudioSessionRouteDescription {
        return audioSession.currentRoute
    }
    
    /// Check if headphones are connected
    var isHeadphonesConnected: Bool {
        let outputs = currentRoute.outputs
        return outputs.contains { output in
            output.portType == .headphones ||
            output.portType == .bluetoothA2DP ||
            output.portType == .bluetoothHFP ||
            output.portType == .bluetoothLE
        }
    }
    
    /// Override audio output to speaker
    func setOutputToSpeaker(_ enabled: Bool) throws {
        try audioSession.overrideOutputAudioPort(enabled ? .speaker : .none)
        logger.info("Audio output set to \(enabled ? "speaker" : "default")")
    }
    
    // MARK: - Sample Rate & Buffer
    
    /// Set preferred sample rate
    func setPreferredSampleRate(_ sampleRate: Double) throws {
        try audioSession.setPreferredSampleRate(sampleRate)
        logger.info("Preferred sample rate set to \(sampleRate) Hz")
    }
    
    /// Set preferred IO buffer duration
    func setPreferredIOBufferDuration(_ duration: TimeInterval) throws {
        try audioSession.setPreferredIOBufferDuration(duration)
        logger.info("Preferred IO buffer duration set to \(duration) seconds")
    }
    
    // MARK: - Notifications
    
    @objc private func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }
        
        switch type {
        case .began:
            logger.info("Audio interruption began")
            NotificationCenter.default.post(name: .audioInterruptionBegan, object: nil)
            
        case .ended:
            logger.info("Audio interruption ended")
            
            if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
                if options.contains(.shouldResume) {
                    // Resume audio
                    logger.info("Should resume audio after interruption")
                    NotificationCenter.default.post(name: .audioInterruptionEnded, object: nil, userInfo: ["shouldResume": true])
                } else {
                    NotificationCenter.default.post(name: .audioInterruptionEnded, object: nil, userInfo: ["shouldResume": false])
                }
            }
            
        @unknown default:
            break
        }
    }
    
    @objc private func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
            return
        }
        
        switch reason {
        case .newDeviceAvailable:
            logger.info("New audio device available")
            NotificationCenter.default.post(name: .audioRouteChanged, object: nil, userInfo: ["reason": "newDevice"])
            
        case .oldDeviceUnavailable:
            logger.info("Audio device removed")
            NotificationCenter.default.post(name: .audioRouteChanged, object: nil, userInfo: ["reason": "deviceRemoved"])
            
        case .categoryChange:
            logger.info("Audio category changed")
            
        default:
            break
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let audioInterruptionBegan = Notification.Name("audioInterruptionBegan")
    static let audioInterruptionEnded = Notification.Name("audioInterruptionEnded")
    static let audioRouteChanged = Notification.Name("audioRouteChanged")
}
