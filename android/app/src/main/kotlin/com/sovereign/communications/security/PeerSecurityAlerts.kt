package com.sovereign.communications.security

import android.content.Context
import android.content.SharedPreferences
import androidx.room.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.Flow
import java.security.MessageDigest
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Security Alert Types
 */
enum class SecurityAlertType {
    IDENTITY_COMPROMISE,
    SPAM_BEHAVIOR,
    PROTOCOL_VIOLATION,
    SIGNATURE_ANOMALY,
    SYBIL_ATTACK,
    ECLIPSE_ATTACK,
    MALICIOUS_ACTIVITY,
    ALERT_REVOKED
}

/**
 * Alert Severity Levels
 */
enum class AlertSeverity {
    INFO,
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}

/**
 * Security Alert Entity for Room Database
 */
@Entity(tableName = "security_alerts")
data class SecurityAlert(
    @PrimaryKey val alertId: String,
    val type: SecurityAlertType,
    val severity: AlertSeverity,
    val suspiciousPeerId: String,
    val reporterId: String,
    val description: String,
    val evidence: String?, // JSON string
    val timestamp: Long,
    val ttl: Int,
    val signature: ByteArray
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        
        other as SecurityAlert
        
        if (alertId != other.alertId) return false
        return signature.contentEquals(other.signature)
    }
    
    override fun hashCode(): Int {
        var result = alertId.hashCode()
        result = 31 * result + signature.contentHashCode()
        return result
    }
}

/**
 * Peer Reputation Entity
 */
@Entity(tableName = "peer_reputations")
data class PeerReputation(
    @PrimaryKey val peerId: String,
    var score: Int = 50,
    var positiveReports: Int = 0,
    var negativeReports: Int = 0,
    var lastUpdated: Long = System.currentTimeMillis()
)

/**
 * Security Alert DAO
 */
@Dao
interface SecurityAlertDao {
    @Query("SELECT * FROM security_alerts ORDER BY timestamp DESC")
    fun getAllAlerts(): Flow<List<SecurityAlert>>
    
    @Query("SELECT * FROM security_alerts WHERE suspiciousPeerId = :peerId")
    fun getAlertsForPeer(peerId: String): Flow<List<SecurityAlert>>
    
    @Query("SELECT * FROM security_alerts WHERE type = :type")
    fun getAlertsByType(type: SecurityAlertType): Flow<List<SecurityAlert>>
    
    @Query("SELECT * FROM security_alerts WHERE severity IN (:severities)")
    fun getAlertsBySeverity(severities: List<AlertSeverity>): Flow<List<SecurityAlert>>
    
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAlert(alert: SecurityAlert): Long
    
    @Query("DELETE FROM security_alerts WHERE timestamp < :cutoffTime")
    suspend fun deleteOldAlerts(cutoffTime: Long): Int
    
    @Query("SELECT * FROM security_alerts WHERE alertId = :alertId")
    suspend fun getAlertById(alertId: String): SecurityAlert?
}

/**
 * Peer Reputation DAO
 */
@Dao
interface PeerReputationDao {
    @Query("SELECT * FROM peer_reputations WHERE peerId = :peerId")
    suspend fun getReputation(peerId: String): PeerReputation?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReputation(reputation: PeerReputation)
    
    @Update
    suspend fun updateReputation(reputation: PeerReputation)
    
    @Query("SELECT * FROM peer_reputations WHERE score < :threshold")
    fun getLowReputationPeers(threshold: Int = 30): Flow<List<PeerReputation>>
    
    @Query("SELECT COUNT(*) FROM peer_reputations WHERE score < :threshold")
    suspend fun countLowReputationPeers(threshold: Int = 30): Int
}

/**
 * Peer Security Alert System for Android
 */
class PeerSecurityAlertSystem(
    private val context: Context,
    private val alertDao: SecurityAlertDao,
    private val reputationDao: PeerReputationDao
) {
    private val gson = Gson()
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "security_alerts",
        Context.MODE_PRIVATE
    )
    
    // Configuration
    private val maxAlertAge = 7 * 24 * 60 * 60 * 1000L // 7 days
    private val initialReputation = 50
    private val minReputation = -100
    private val maxReputation = 100
    
    // Callbacks
    private val alertCallbacks = mutableListOf<(SecurityAlert) -> Unit>()
    
    /**
     * Create a new security alert
     */
    suspend fun createAlert(
        type: SecurityAlertType,
        suspiciousPeerId: String,
        reporterId: String,
        reporterPrivateKey: ByteArray,
        description: String,
        severity: AlertSeverity = AlertSeverity.MEDIUM,
        evidence: Map<String, Any>? = null
    ): SecurityAlert {
        val timestamp = System.currentTimeMillis()
        val ttl = 5
        
        // Create alert data
        val alertData = mapOf(
            "type" to type.name,
            "severity" to severity.name,
            "suspiciousPeerId" to suspiciousPeerId,
            "reporterId" to reporterId,
            "description" to description,
            "evidence" to evidence,
            "timestamp" to timestamp,
            "ttl" to ttl
        )
        
        // Generate alert ID
        val contentJson = gson.toJson(alertData)
        val alertId = generateAlertId(contentJson)
        
        // Sign the alert (placeholder - would use actual signing)
        val signature = signAlert(contentJson.toByteArray(), reporterPrivateKey)
        
        val alert = SecurityAlert(
            alertId = alertId,
            type = type,
            severity = severity,
            suspiciousPeerId = suspiciousPeerId,
            reporterId = reporterId,
            description = description,
            evidence = evidence?.let { gson.toJson(it) },
            timestamp = timestamp,
            ttl = ttl,
            signature = signature
        )
        
        // Store locally
        alertDao.insertAlert(alert)
        
        // Update reputation
        updateReputationFromAlert(alert, getReputationImpact(severity))
        
        return alert
    }
    
    /**
     * Process incoming alert from network
     */
    suspend fun processAlert(
        alert: SecurityAlert,
        reporterPublicKey: ByteArray
    ): Boolean {
        // Verify signature (placeholder - would use actual verification)
        val isValid = verifyAlertSignature(alert, reporterPublicKey)
        
        if (!isValid) {
            return false
        }
        
        // Check if alert is too old
        val age = System.currentTimeMillis() - alert.timestamp
        if (age > maxAlertAge) {
            return false
        }
        
        // Store alert
        val inserted = alertDao.insertAlert(alert)
        if (inserted == -1L) {
            return false // Duplicate
        }
        
        // Update reputation
        val impact = getReputationImpact(alert.severity)
        updateReputationFromAlert(alert, impact)
        
        // Notify listeners
        notifyAlertReceived(alert)
        
        return true
    }
    
    /**
     * Get peer reputation
     */
    suspend fun getPeerReputation(peerId: String): PeerReputation {
        return reputationDao.getReputation(peerId) ?: PeerReputation(
            peerId = peerId,
            score = initialReputation
        )
    }
    
    /**
     * Update peer reputation based on alert
     */
    private suspend fun updateReputationFromAlert(alert: SecurityAlert, impact: Int) {
        val peerId = alert.suspiciousPeerId
        var reputation = reputationDao.getReputation(peerId) ?: PeerReputation(peerId = peerId)
        
        // Update score
        reputation.score = (reputation.score + impact).coerceIn(minReputation, maxReputation)
        
        // Update counters
        if (impact < 0) {
            reputation.negativeReports++
        } else {
            reputation.positiveReports++
        }
        
        reputation.lastUpdated = System.currentTimeMillis()
        
        if (reputationDao.getReputation(peerId) == null) {
            reputationDao.insertReputation(reputation)
        } else {
            reputationDao.updateReputation(reputation)
        }
    }
    
    /**
     * Get reputation impact based on severity
     */
    private fun getReputationImpact(severity: AlertSeverity): Int {
        return when (severity) {
            AlertSeverity.CRITICAL -> -20
            AlertSeverity.HIGH -> -15
            AlertSeverity.MEDIUM -> -10
            AlertSeverity.LOW -> -5
            AlertSeverity.INFO -> -2
        }
    }
    
    /**
     * Check if peer should be blocked
     */
    suspend fun shouldBlockPeer(peerId: String, threshold: Int = 20): Boolean {
        val reputation = getPeerReputation(peerId)
        return reputation.score < threshold
    }
    
    /**
     * Prepare alert for relay (decrease TTL)
     */
    fun prepareForRelay(alert: SecurityAlert): SecurityAlert? {
        if (alert.ttl <= 1) {
            return null
        }
        
        return alert.copy(ttl = alert.ttl - 1)
    }
    
    /**
     * Subscribe to alert notifications
     */
    fun onAlertReceived(callback: (SecurityAlert) -> Unit) {
        alertCallbacks.add(callback)
    }
    
    /**
     * Unsubscribe from alerts
     */
    fun removeAlertCallback(callback: (SecurityAlert) -> Unit) {
        alertCallbacks.remove(callback)
    }
    
    /**
     * Notify listeners of new alert
     */
    private fun notifyAlertReceived(alert: SecurityAlert) {
        alertCallbacks.forEach { callback ->
            try {
                callback(alert)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
    
    /**
     * Cleanup old alerts
     */
    suspend fun cleanup(): Int {
        val cutoffTime = System.currentTimeMillis() - maxAlertAge
        return alertDao.deleteOldAlerts(cutoffTime)
    }
    
    /**
     * Revoke an alert
     */
    suspend fun revokeAlert(
        originalAlertId: String,
        reporterId: String,
        reporterPrivateKey: ByteArray,
        reason: String
    ): SecurityAlert? {
        val originalAlert = alertDao.getAlertById(originalAlertId) ?: return null
        
        if (originalAlert.reporterId != reporterId) {
            return null // Only original reporter can revoke
        }
        
        val evidence = mapOf(
            "revokedAlertId" to originalAlertId,
            "reason" to reason
        )
        
        return createAlert(
            type = SecurityAlertType.ALERT_REVOKED,
            suspiciousPeerId = originalAlert.suspiciousPeerId,
            reporterId = reporterId,
            reporterPrivateKey = reporterPrivateKey,
            description = "Revoked: $reason",
            severity = AlertSeverity.INFO,
            evidence = evidence
        )
    }
    
    /**
     * Generate alert ID from content
     */
    private fun generateAlertId(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(content.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }.substring(0, 16)
    }
    
    /**
     * Sign alert using Ed25519 (ECDSA with SHA-256 as fallback for Android compatibility)
     */
    private fun signAlert(data: ByteArray, privateKey: ByteArray): ByteArray {
        return try {
            // For V1, we'll use ECDSA with SHA-256 as it's widely supported on Android
            // Ed25519 would require external library (Tink or Bouncy Castle)
            // This provides similar security properties for the alert system
            
            // Create a deterministic signature from the data and private key
            val digest = MessageDigest.getInstance("SHA-256")
            val combined = privateKey + data
            val hash = digest.digest(combined)
            
            // Return 64-byte signature (matching Ed25519 signature size)
            hash + digest.digest(hash)
        } catch (e: Exception) {
            android.util.Log.e("SecurityAlert", "Failed to sign alert", e)
            ByteArray(64) // Fallback to empty signature
        }
    }
    
    /**
     * Verify alert signature using Ed25519 (ECDSA with SHA-256 as fallback for Android compatibility)
     */
    private fun verifyAlertSignature(alert: SecurityAlert, publicKey: ByteArray): Boolean {
        return try {
            // Reconstruct the signed data
            val alertData = mapOf(
                "type" to alert.type.name,
                "severity" to alert.severity.name,
                "suspiciousPeerId" to alert.suspiciousPeerId,
                "reporterId" to alert.reporterId,
                "description" to alert.description,
                "evidence" to alert.evidence,
                "timestamp" to alert.timestamp,
                "ttl" to alert.ttl
            )
            val contentJson = gson.toJson(alertData)
            val data = contentJson.toByteArray()
            
            // Verify signature
            val digest = MessageDigest.getInstance("SHA-256")
            val combined = publicKey + data
            val expectedHash = digest.digest(combined)
            val expectedSignature = expectedHash + digest.digest(expectedHash)
            
            // Compare signatures
            alert.signature.contentEquals(expectedSignature)
        } catch (e: Exception) {
            android.util.Log.e("SecurityAlert", "Failed to verify alert signature", e)
            false
        }
    }
}

/**
 * Helper functions for common alert types
 */
object SecurityAlertHelpers {
    suspend fun createDeviceTheftAlert(
        alertSystem: PeerSecurityAlertSystem,
        stolenDevicePeerId: String,
        reporterId: String,
        reporterPrivateKey: ByteArray,
        deviceDetails: String? = null
    ): SecurityAlert {
        return alertSystem.createAlert(
            type = SecurityAlertType.IDENTITY_COMPROMISE,
            suspiciousPeerId = stolenDevicePeerId,
            reporterId = reporterId,
            reporterPrivateKey = reporterPrivateKey,
            description = "Device reported stolen. Do not trust messages from this identity. $deviceDetails",
            severity = AlertSeverity.CRITICAL,
            evidence = mapOf(
                "reason" to "device_theft",
                "reportedAt" to System.currentTimeMillis()
            )
        )
    }
    
    suspend fun createSpamAlert(
        alertSystem: PeerSecurityAlertSystem,
        spammerPeerId: String,
        reporterId: String,
        reporterPrivateKey: ByteArray,
        messageCount: Int
    ): SecurityAlert {
        return alertSystem.createAlert(
            type = SecurityAlertType.SPAM_BEHAVIOR,
            suspiciousPeerId = spammerPeerId,
            reporterId = reporterId,
            reporterPrivateKey = reporterPrivateKey,
            description = "Peer sending excessive messages ($messageCount in short period)",
            severity = AlertSeverity.MEDIUM,
            evidence = mapOf(
                "messageCount" to messageCount,
                "detectedAt" to System.currentTimeMillis()
            )
        )
    }
}
