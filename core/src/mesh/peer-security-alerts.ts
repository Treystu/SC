/**
 * Decentralized Peer Security Alert System
 * 
 * Enables peers to broadcast security warnings about compromised identities,
 * malicious actors, or suspicious behavior in the mesh network.
 * 
 * Key principles:
 * - No central authority (decentralized trust)
 * - Alerts are informational, not authoritative
 * - Users maintain own reputation scoring
 * - Out-of-band verification recommended for critical alerts
 */

import { signMessage, verifySignature } from '../crypto/primitives.js';

export enum SecurityAlertType {
  /** Identity keys compromised (device stolen, malware, etc.) */
  IDENTITY_COMPROMISE = 'IDENTITY_COMPROMISE',
  
  /** Peer sending spam or flooding network */
  SPAM_BEHAVIOR = 'SPAM_BEHAVIOR',
  
  /** Peer violating protocol rules */
  PROTOCOL_VIOLATION = 'PROTOCOL_VIOLATION',
  
  /** Suspicious signature mismatches detected */
  SIGNATURE_ANOMALY = 'SIGNATURE_ANOMALY',
  
  /** Peer attempting Sybil attack (multiple identities) */
  SYBIL_ATTACK = 'SYBIL_ATTACK',
  
  /** Eclipse attack attempt (isolating peers) */
  ECLIPSE_ATTACK = 'ECLIPSE_ATTACK',
  
  /** General malicious activity */
  MALICIOUS_ACTIVITY = 'MALICIOUS_ACTIVITY',
  
  /** Alert revocation (false alarm) */
  ALERT_REVOKED = 'ALERT_REVOKED',
}

export enum AlertSeverity {
  /** Informational - awareness only */
  INFO = 'INFO',
  
  /** Low severity - minor concern */
  LOW = 'LOW',
  
  /** Medium severity - investigate */
  MEDIUM = 'MEDIUM',
  
  /** High severity - likely threat */
  HIGH = 'HIGH',
  
  /** Critical - immediate action recommended */
  CRITICAL = 'CRITICAL',
}

export interface SecurityAlert {
  /** Unique alert ID (hash of alert content) */
  alertId: string;
  
  /** Type of security incident */
  type: SecurityAlertType;
  
  /** Severity level */
  severity: AlertSeverity;
  
  /** Peer ID being reported */
  suspiciousPeerId: string;
  
  /** Peer ID issuing the alert */
  reporterId: string;
  
  /** Human-readable description */
  description: string;
  
  /** Optional evidence (hashes, timestamps, etc.) */
  evidence?: {
    messageHash?: string;
    timestamp?: number;
    signatureMismatch?: boolean;
    violationType?: string;
    [key: string]: any;
  };
  
  /** Alert timestamp */
  timestamp: number;
  
  /** TTL for alert propagation (hops) */
  ttl: number;
  
  /** Ed25519 signature from reporter */
  signature: Uint8Array;
}

export interface AlertVerification {
  /** Is signature valid? */
  signatureValid: boolean;
  
  /** Alert metadata */
  alert: SecurityAlert;
  
  /** Verification timestamp */
  verifiedAt: number;
}

export interface PeerReputation {
  /** Peer ID */
  peerId: string;
  
  /** Reputation score (-100 to 100) */
  score: number;
  
  /** Number of positive reports */
  positiveReports: number;
  
  /** Number of negative reports */
  negativeReports: number;
  
  /** Active alerts against this peer */
  activeAlerts: SecurityAlert[];
  
  /** Last updated */
  lastUpdated: number;
}

export class PeerSecurityAlertSystem {
  private receivedAlerts: Map<string, SecurityAlert> = new Map();
  private peerReputations: Map<string, PeerReputation> = new Map();
  private alertCallbacks: Set<(alert: SecurityAlert) => void> = new Set();
  
  // Configuration
  private readonly MAX_ALERT_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly INITIAL_REPUTATION = 50;
  private readonly MIN_REPUTATION = -100;
  private readonly MAX_REPUTATION = 100;
  
  /**
   * Create a new security alert
   */
  async createAlert(
    type: SecurityAlertType,
    suspiciousPeerId: string,
    reporterId: string,
    reporterPrivateKey: Uint8Array,
    description: string,
    severity: AlertSeverity = AlertSeverity.MEDIUM,
    evidence?: any
  ): Promise<SecurityAlert> {
    const timestamp = Date.now();
    
    // Create alert without signature
    const alertData = {
      type,
      severity,
      suspiciousPeerId,
      reporterId,
      description,
      evidence,
      timestamp,
      ttl: 5, // 5 hops maximum
    };
    
    // Generate alert ID from content
    const alertContent = JSON.stringify(alertData);
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(alertContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', contentBytes);
    const alertId = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16);
    
    // Sign the alert
    const signature = await signMessage(contentBytes, reporterPrivateKey);
    
    const alert: SecurityAlert = {
      alertId,
      ...alertData,
      signature,
    };
    
    // Store locally
    this.receivedAlerts.set(alertId, alert);
    
    // Update reputation
    this.updateReputationFromAlert(alert, -10); // Negative report
    
    return alert;
  }
  
  /**
   * Verify and process incoming alert
   */
  async processAlert(alert: SecurityAlert, reporterPublicKey: Uint8Array): Promise<AlertVerification> {
    // Create alert content for signature verification
    const alertData = {
      type: alert.type,
      severity: alert.severity,
      suspiciousPeerId: alert.suspiciousPeerId,
      reporterId: alert.reporterId,
      description: alert.description,
      evidence: alert.evidence,
      timestamp: alert.timestamp,
      ttl: alert.ttl,
    };
    
    const alertContent = JSON.stringify(alertData);
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(alertContent);
    
    // Verify signature
    const signatureValid = verifySignature(
      contentBytes,
      alert.signature,
      reporterPublicKey
    );
    
    const verification: AlertVerification = {
      signatureValid,
      alert,
      verifiedAt: Date.now(),
    };
    
    if (!signatureValid) {
      console.warn('Invalid alert signature from', alert.reporterId);
      return verification;
    }
    
    // Check if alert is too old
    const age = Date.now() - alert.timestamp;
    if (age > this.MAX_ALERT_AGE) {
      console.warn('Alert expired (too old):', alert.alertId);
      return verification;
    }
    
    // Check for duplicate
    if (this.receivedAlerts.has(alert.alertId)) {
      return verification; // Already processed
    }
    
    // Store alert
    this.receivedAlerts.set(alert.alertId, alert);
    
    // Update reputation
    const impact = this.getReputationImpact(alert.severity);
    this.updateReputationFromAlert(alert, impact);
    
    // Notify listeners
    this.notifyAlertReceived(alert);
    
    return verification;
  }
  
  /**
   * Get reputation impact based on severity
   */
  private getReputationImpact(severity: AlertSeverity): number {
    switch (severity) {
      case AlertSeverity.CRITICAL: return -20;
      case AlertSeverity.HIGH: return -15;
      case AlertSeverity.MEDIUM: return -10;
      case AlertSeverity.LOW: return -5;
      case AlertSeverity.INFO: return -2;
      default: return -5;
    }
  }
  
  /**
   * Update peer reputation based on alert
   */
  private updateReputationFromAlert(alert: SecurityAlert, impact: number): void {
    const peerId = alert.suspiciousPeerId;
    
    let reputation = this.peerReputations.get(peerId);
    if (!reputation) {
      reputation = {
        peerId,
        score: this.INITIAL_REPUTATION,
        positiveReports: 0,
        negativeReports: 0,
        activeAlerts: [],
        lastUpdated: Date.now(),
      };
      this.peerReputations.set(peerId, reputation);
    }
    
    // Update score
    reputation.score = Math.max(
      this.MIN_REPUTATION,
      Math.min(this.MAX_REPUTATION, reputation.score + impact)
    );
    
    // Update counters
    if (impact < 0) {
      reputation.negativeReports++;
    } else {
      reputation.positiveReports++;
    }
    
    // Add to active alerts (unless revocation)
    if (alert.type !== SecurityAlertType.ALERT_REVOKED) {
      reputation.activeAlerts.push(alert);
    } else {
      // Remove revoked alerts
      reputation.activeAlerts = reputation.activeAlerts.filter(
        a => a.alertId !== alert.evidence?.revokedAlertId
      );
    }
    
    reputation.lastUpdated = Date.now();
  }
  
  /**
   * Get peer reputation
   */
  getPeerReputation(peerId: string): PeerReputation {
    const reputation = this.peerReputations.get(peerId);
    if (!reputation) {
      return {
        peerId,
        score: this.INITIAL_REPUTATION,
        positiveReports: 0,
        negativeReports: 0,
        activeAlerts: [],
        lastUpdated: Date.now(),
      };
    }
    return reputation;
  }
  
  /**
   * Check if peer should be blocked based on reputation
   */
  shouldBlockPeer(peerId: string, threshold: number = 20): boolean {
    const reputation = this.getPeerReputation(peerId);
    return reputation.score < threshold;
  }
  
  /**
   * Get all alerts for a specific peer
   */
  getAlertsForPeer(peerId: string): SecurityAlert[] {
    return Array.from(this.receivedAlerts.values()).filter(
      alert => alert.suspiciousPeerId === peerId
    );
  }
  
  /**
   * Get alerts by type
   */
  getAlertsByType(type: SecurityAlertType): SecurityAlert[] {
    return Array.from(this.receivedAlerts.values()).filter(
      alert => alert.type === type
    );
  }
  
  /**
   * Subscribe to alert notifications
   */
  onAlertReceived(callback: (alert: SecurityAlert) => void): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }
  
  /**
   * Notify listeners of new alert
   */
  private notifyAlertReceived(alert: SecurityAlert): void {
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('Alert callback error:', error);
      }
    }
  }
  
  /**
   * Revoke a previously issued alert (false alarm)
   */
  async revokeAlert(
    originalAlertId: string,
    reporterId: string,
    reporterPrivateKey: Uint8Array,
    reason: string
  ): Promise<SecurityAlert | null> {
    const originalAlert = this.receivedAlerts.get(originalAlertId);
    if (!originalAlert) {
      console.warn('Cannot revoke unknown alert:', originalAlertId);
      return null;
    }
    
    // Only original reporter can revoke
    if (originalAlert.reporterId !== reporterId) {
      console.warn('Only original reporter can revoke alert');
      return null;
    }
    
    // Create revocation alert
    return this.createAlert(
      SecurityAlertType.ALERT_REVOKED,
      originalAlert.suspiciousPeerId,
      reporterId,
      reporterPrivateKey,
      `Revoked: ${reason}`,
      AlertSeverity.INFO,
      { revokedAlertId: originalAlertId }
    );
  }
  
  /**
   * Prepare alert for relay (decrease TTL)
   */
  prepareForRelay(alert: SecurityAlert): SecurityAlert | null {
    if (alert.ttl <= 1) {
      return null; // Don't relay, TTL exhausted
    }
    
    return {
      ...alert,
      ttl: alert.ttl - 1,
    };
  }
  
  /**
   * Cleanup old alerts
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    
    for (const [alertId, alert] of this.receivedAlerts.entries()) {
      const age = now - alert.timestamp;
      if (age > this.MAX_ALERT_AGE) {
        this.receivedAlerts.delete(alertId);
        removed++;
      }
    }
    
    return removed;
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    const alerts = Array.from(this.receivedAlerts.values());
    
    return {
      totalAlerts: alerts.length,
      alertsByType: {
        identityCompromise: alerts.filter(a => a.type === SecurityAlertType.IDENTITY_COMPROMISE).length,
        spam: alerts.filter(a => a.type === SecurityAlertType.SPAM_BEHAVIOR).length,
        protocolViolation: alerts.filter(a => a.type === SecurityAlertType.PROTOCOL_VIOLATION).length,
        signatureAnomaly: alerts.filter(a => a.type === SecurityAlertType.SIGNATURE_ANOMALY).length,
        sybilAttack: alerts.filter(a => a.type === SecurityAlertType.SYBIL_ATTACK).length,
        eclipseAttack: alerts.filter(a => a.type === SecurityAlertType.ECLIPSE_ATTACK).length,
        malicious: alerts.filter(a => a.type === SecurityAlertType.MALICIOUS_ACTIVITY).length,
        revoked: alerts.filter(a => a.type === SecurityAlertType.ALERT_REVOKED).length,
      },
      alertsBySeverity: {
        critical: alerts.filter(a => a.severity === AlertSeverity.CRITICAL).length,
        high: alerts.filter(a => a.severity === AlertSeverity.HIGH).length,
        medium: alerts.filter(a => a.severity === AlertSeverity.MEDIUM).length,
        low: alerts.filter(a => a.severity === AlertSeverity.LOW).length,
        info: alerts.filter(a => a.severity === AlertSeverity.INFO).length,
      },
      trackedPeers: this.peerReputations.size,
      peersWithNegativeReputation: Array.from(this.peerReputations.values()).filter(
        r => r.score < this.INITIAL_REPUTATION
      ).length,
    };
  }
}

/**
 * Helper: Create device theft alert
 */
export async function createDeviceTheftAlert(
  stolenDevicePeerId: string,
  reporterId: string,
  reporterPrivateKey: Uint8Array,
  deviceDetails?: string
): Promise<SecurityAlert> {
  const alertSystem = new PeerSecurityAlertSystem();
  
  return alertSystem.createAlert(
    SecurityAlertType.IDENTITY_COMPROMISE,
    stolenDevicePeerId,
    reporterId,
    reporterPrivateKey,
    `Device reported stolen. Do not trust messages from this identity. ${deviceDetails || ''}`,
    AlertSeverity.CRITICAL,
    {
      reason: 'device_theft',
      reportedAt: Date.now(),
    }
  );
}

/**
 * Helper: Create spam alert
 */
export async function createSpamAlert(
  spammerPeerId: string,
  reporterId: string,
  reporterPrivateKey: Uint8Array,
  messageCount: number
): Promise<SecurityAlert> {
  const alertSystem = new PeerSecurityAlertSystem();
  
  return alertSystem.createAlert(
    SecurityAlertType.SPAM_BEHAVIOR,
    spammerPeerId,
    reporterId,
    reporterPrivateKey,
    `Peer sending excessive messages (${messageCount} in short period)`,
    AlertSeverity.MEDIUM,
    {
      messageCount,
      detectedAt: Date.now(),
    }
  );
}
