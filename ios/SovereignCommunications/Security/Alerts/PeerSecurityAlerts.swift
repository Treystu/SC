import Foundation
import CryptoKit

/// Security Alert Types
enum SecurityAlertType: String, Codable {
    case identityCompromise = "IDENTITY_COMPROMISE"
    case spamBehavior = "SPAM_BEHAVIOR"
    case protocolViolation = "PROTOCOL_VIOLATION"
    case signatureAnomaly = "SIGNATURE_ANOMALY"
    case sybilAttack = "SYBIL_ATTACK"
    case eclipseAttack = "ECLIPSE_ATTACK"
    case maliciousActivity = "MALICIOUS_ACTIVITY"
    case alertRevoked = "ALERT_REVOKED"
}

/// Alert Severity Levels
enum AlertSeverity: String, Codable {
    case info = "INFO"
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
    case critical = "CRITICAL"
}

/// Security Alert Structure
struct SecurityAlert: Codable, Identifiable {
    let id: String  // alertId
    let type: SecurityAlertType
    let severity: AlertSeverity
    let suspiciousPeerId: String
    let reporterId: String
    let description: String
    let evidence: [String: AnyCodable]?
    let timestamp: Int64
    let ttl: Int
    let signature: Data
    
    enum CodingKeys: String, CodingKey {
        case id = "alertId"
        case type, severity, suspiciousPeerId, reporterId
        case description, evidence, timestamp, ttl, signature
    }
}

/// Peer Reputation
struct PeerReputation {
    let peerId: String
    var score: Int
    var positiveReports: Int
    var negativeReports: Int
    var activeAlerts: [SecurityAlert]
    var lastUpdated: Date
    
    init(peerId: String, score: Int = 50) {
        self.peerId = peerId
        self.score = score
        self.positiveReports = 0
        self.negativeReports = 0
        self.activeAlerts = []
        self.lastUpdated = Date()
    }
}

/// Peer Security Alert System for iOS
class PeerSecurityAlertSystem {
    // Configuration
    private let maxAlertAge: TimeInterval = 7 * 24 * 60 * 60 // 7 days
    private let initialReputation = 50
    private let minReputation = -100
    private let maxReputation = 100
    
    // Storage
    private var receivedAlerts: [String: SecurityAlert] = [:]
    private var peerReputations: [String: PeerReputation] = [:]
    
    // Callbacks
    private var alertCallbacks: [(SecurityAlert) -> Void] = []
    
    /// Create a new security alert
    func createAlert(
        type: SecurityAlertType,
        suspiciousPeerId: String,
        reporterId: String,
        reporterPrivateKey: Data,
        description: String,
        severity: AlertSeverity = .medium,
        evidence: [String: AnyCodable]? = nil
    ) async throws -> SecurityAlert {
        let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
        let ttl = 5
        
        // Create alert data for hashing and signing
        let alertData: [String: Any] = [
            "type": type.rawValue,
            "severity": severity.rawValue,
            "suspiciousPeerId": suspiciousPeerId,
            "reporterId": reporterId,
            "description": description,
            "evidence": evidence as Any,
            "timestamp": timestamp,
            "ttl": ttl
        ]
        
        // Generate alert ID
        let alertId = try generateAlertId(from: alertData)
        
        // Sign the alert
        let signature = try signAlert(data: alertData, privateKey: reporterPrivateKey)
        
        let alert = SecurityAlert(
            id: alertId,
            type: type,
            severity: severity,
            suspiciousPeerId: suspiciousPeerId,
            reporterId: reporterId,
            description: description,
            evidence: evidence,
            timestamp: timestamp,
            ttl: ttl,
            signature: signature
        )
        
        // Store locally
        receivedAlerts[alertId] = alert
        
        // Update reputation
        let impact = getReputationImpact(severity: severity)
        updateReputationFromAlert(alert: alert, impact: impact)
        
        // Persist to UserDefaults/CoreData
        try saveAlerts()
        
        return alert
    }
    
    /// Process incoming alert from network
    func processAlert(alert: SecurityAlert, reporterPublicKey: Data) async throws -> Bool {
        // Verify signature
        let isValid = try verifyAlertSignature(alert: alert, publicKey: reporterPublicKey)
        
        guard isValid else {
            print("Invalid alert signature")
            return false
        }
        
        // Check if alert is too old
        let age = Date().timeIntervalSince1970 * 1000 - Double(alert.timestamp)
        guard age < maxAlertAge * 1000 else {
            print("Alert expired (too old)")
            return false
        }
        
        // Check for duplicate
        guard receivedAlerts[alert.id] == nil else {
            return false // Already processed
        }
        
        // Store alert
        receivedAlerts[alert.id] = alert
        
        // Update reputation
        let impact = getReputationImpact(severity: alert.severity)
        updateReputationFromAlert(alert: alert, impact: impact)
        
        // Notify listeners
        notifyAlertReceived(alert: alert)
        
        // Persist
        try saveAlerts()
        
        return true
    }
    
    /// Get peer reputation
    func getPeerReputation(peerId: String) -> PeerReputation {
        return peerReputations[peerId] ?? PeerReputation(peerId: peerId)
    }
    
    /// Update peer reputation based on alert
    private func updateReputationFromAlert(alert: SecurityAlert, impact: Int) {
        let peerId = alert.suspiciousPeerId
        var reputation = peerReputations[peerId] ?? PeerReputation(peerId: peerId)
        
        // Update score
        reputation.score = min(maxReputation, max(minReputation, reputation.score + impact))
        
        // Update counters
        if impact < 0 {
            reputation.negativeReports += 1
        } else {
            reputation.positiveReports += 1
        }
        
        // Add to active alerts
        if alert.type != .alertRevoked {
            reputation.activeAlerts.append(alert)
        }
        
        reputation.lastUpdated = Date()
        peerReputations[peerId] = reputation
    }
    
    /// Get reputation impact based on severity
    private func getReputationImpact(severity: AlertSeverity) -> Int {
        switch severity {
        case .critical: return -20
        case .high: return -15
        case .medium: return -10
        case .low: return -5
        case .info: return -2
        }
    }
    
    /// Check if peer should be blocked
    func shouldBlockPeer(peerId: String, threshold: Int = 20) -> Bool {
        let reputation = getPeerReputation(peerId: peerId)
        return reputation.score < threshold
    }
    
    /// Get all alerts for a specific peer
    func getAlertsForPeer(peerId: String) -> [SecurityAlert] {
        return receivedAlerts.values.filter { $0.suspiciousPeerId == peerId }
    }
    
    /// Get alerts by type
    func getAlertsByType(type: SecurityAlertType) -> [SecurityAlert] {
        return receivedAlerts.values.filter { $0.type == type }
    }
    
    /// Subscribe to alert notifications
    func onAlertReceived(callback: @escaping (SecurityAlert) -> Void) {
        alertCallbacks.append(callback)
    }
    
    /// Notify listeners of new alert
    private func notifyAlertReceived(alert: SecurityAlert) {
        for callback in alertCallbacks {
            callback(alert)
        }
    }
    
    /// Prepare alert for relay (decrease TTL)
    func prepareForRelay(alert: SecurityAlert) -> SecurityAlert? {
        guard alert.ttl > 1 else {
            return nil
        }
        
        return SecurityAlert(
            id: alert.id,
            type: alert.type,
            severity: alert.severity,
            suspiciousPeerId: alert.suspiciousPeerId,
            reporterId: alert.reporterId,
            description: alert.description,
            evidence: alert.evidence,
            timestamp: alert.timestamp,
            ttl: alert.ttl - 1,
            signature: alert.signature
        )
    }
    
    /// Cleanup old alerts
    func cleanup() -> Int {
        let cutoffTime = Int64((Date().timeIntervalSince1970 - maxAlertAge) * 1000)
        let oldAlerts = receivedAlerts.filter { $0.value.timestamp < cutoffTime }
        
        for alertId in oldAlerts.keys {
            receivedAlerts.removeValue(forKey: alertId)
        }
        
        return oldAlerts.count
    }
    
    /// Get statistics
    func getStatistics() -> [String: Any] {
        let alerts = Array(receivedAlerts.values)
        
        return [
            "totalAlerts": alerts.count,
            "alertsByType": [
                "identityCompromise": alerts.filter { $0.type == .identityCompromise }.count,
                "spam": alerts.filter { $0.type == .spamBehavior }.count,
                "protocolViolation": alerts.filter { $0.type == .protocolViolation }.count,
                "signatureAnomaly": alerts.filter { $0.type == .signatureAnomaly }.count,
                "sybilAttack": alerts.filter { $0.type == .sybilAttack }.count,
                "eclipseAttack": alerts.filter { $0.type == .eclipseAttack }.count,
                "malicious": alerts.filter { $0.type == .maliciousActivity }.count,
                "revoked": alerts.filter { $0.type == .alertRevoked }.count
            ],
            "alertsBySeverity": [
                "critical": alerts.filter { $0.severity == .critical }.count,
                "high": alerts.filter { $0.severity == .high }.count,
                "medium": alerts.filter { $0.severity == .medium }.count,
                "low": alerts.filter { $0.severity == .low }.count,
                "info": alerts.filter { $0.severity == .info }.count
            ],
            "trackedPeers": peerReputations.count,
            "peersWithNegativeReputation": peerReputations.values.filter { $0.score < initialReputation }.count
        ]
    }
    
    // MARK: - Helper Methods
    
    private func generateAlertId(from data: [String: Any]) throws -> String {
        let jsonData = try JSONSerialization.data(withJSONObject: data)
        let hash = SHA256.hash(data: jsonData)
        return hash.compactMap { String(format: "%02x", $0) }.joined().prefix(16).description
    }
    
    private func signAlert(data: [String: Any], privateKey: Data) throws -> Data {
        // TODO: Implement Ed25519 signing
        // Placeholder
        return Data(count: 64)
    }
    
    private func verifyAlertSignature(alert: SecurityAlert, publicKey: Data) throws -> Bool {
        // TODO: Implement Ed25519 verification
        // Placeholder
        return true
    }
    
    private func saveAlerts() throws {
        let encoder = JSONEncoder()
        let data = try encoder.encode(Array(receivedAlerts.values))
        UserDefaults.standard.set(data, forKey: "security_alerts")
    }
    
    func loadAlerts() throws {
        guard let data = UserDefaults.standard.data(forKey: "security_alerts") else {
            return
        }
        
        let decoder = JSONDecoder()
        let alerts = try decoder.decode([SecurityAlert].self, from: data)
        
        for alert in alerts {
            receivedAlerts[alert.id] = alert
        }
    }
}

// MARK: - Helper Functions

extension PeerSecurityAlertSystem {
    /// Create device theft alert
    func createDeviceTheftAlert(
        stolenDevicePeerId: String,
        reporterId: String,
        reporterPrivateKey: Data,
        deviceDetails: String? = nil
    ) async throws -> SecurityAlert {
        let description = "Device reported stolen. Do not trust messages from this identity. \(deviceDetails ?? "")"
        
        let evidence: [String: AnyCodable] = [
            "reason": AnyCodable("device_theft"),
            "reportedAt": AnyCodable(Int64(Date().timeIntervalSince1970 * 1000))
        ]
        
        return try await createAlert(
            type: .identityCompromise,
            suspiciousPeerId: stolenDevicePeerId,
            reporterId: reporterId,
            reporterPrivateKey: reporterPrivateKey,
            description: description,
            severity: .critical,
            evidence: evidence
        )
    }
    
    /// Create spam alert
    func createSpamAlert(
        spammerPeerId: String,
        reporterId: String,
        reporterPrivateKey: Data,
        messageCount: Int
    ) async throws -> SecurityAlert {
        let description = "Peer sending excessive messages (\(messageCount) in short period)"
        
        let evidence: [String: AnyCodable] = [
            "messageCount": AnyCodable(messageCount),
            "detectedAt": AnyCodable(Int64(Date().timeIntervalSince1970 * 1000))
        ]
        
        return try await createAlert(
            type: .spamBehavior,
            suspiciousPeerId: spammerPeerId,
            reporterId: reporterId,
            reporterPrivateKey: reporterPrivateKey,
            description: description,
            severity: .medium,
            evidence: evidence
        )
    }
}

// MARK: - AnyCodable Helper

struct AnyCodable: Codable {
    let value: Any
    
    init(_ value: Any) {
        self.value = value
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        
        if let intValue = try? container.decode(Int.self) {
            value = intValue
        } else if let int64Value = try? container.decode(Int64.self) {
            value = int64Value
        } else if let stringValue = try? container.decode(String.self) {
            value = stringValue
        } else if let boolValue = try? container.decode(Bool.self) {
            value = boolValue
        } else if let doubleValue = try? container.decode(Double.self) {
            value = doubleValue
        } else {
            throw DecodingError.typeMismatch(
                AnyCodable.self,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported type")
            )
        }
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        
        switch value {
        case let intValue as Int:
            try container.encode(intValue)
        case let int64Value as Int64:
            try container.encode(int64Value)
        case let stringValue as String:
            try container.encode(stringValue)
        case let boolValue as Bool:
            try container.encode(boolValue)
        case let doubleValue as Double:
            try container.encode(doubleValue)
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(codingPath: encoder.codingPath, debugDescription: "Unsupported type")
            )
        }
    }
}
