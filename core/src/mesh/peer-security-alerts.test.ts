/**
 * Tests for Peer Security Alert System
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  PeerSecurityAlertSystem,
  SecurityAlertType,
  AlertSeverity,
  createDeviceTheftAlert,
  createSpamAlert,
} from './peer-security-alerts';

describe('PeerSecurityAlertSystem', () => {
  let alertSystem: PeerSecurityAlertSystem;
  let reporterPrivateKey: Uint8Array;
  let reporterPublicKey: Uint8Array;
  let suspiciousPrivateKey: Uint8Array;
  let suspiciousPublicKey: Uint8Array;

  beforeEach(async () => {
    alertSystem = new PeerSecurityAlertSystem();
    
    // Generate test keys
    const reporterKeyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' } as any,
      true,
      ['sign', 'verify']
    );
    
    const suspiciousKeyPair = await crypto.subtle.generateKey(
      { name: 'Ed25519' } as any,
      true,
      ['sign', 'verify']
    );
    
    reporterPrivateKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', reporterKeyPair.privateKey)
    );
    reporterPublicKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', reporterKeyPair.publicKey)
    );
    
    suspiciousPrivateKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', suspiciousKeyPair.privateKey)
    );
    suspiciousPublicKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', suspiciousKeyPair.publicKey)
    );
  });

  describe('Alert Creation', () => {
    it('should create a valid security alert', async () => {
      const alert = await alertSystem.createAlert(
        SecurityAlertType.IDENTITY_COMPROMISE,
        'suspicious-peer-123',
        'reporter-peer-456',
        reporterPrivateKey,
        'Device stolen, do not trust',
        AlertSeverity.CRITICAL
      );

      expect(alert.alertId).toBeDefined();
      expect(alert.type).toBe(SecurityAlertType.IDENTITY_COMPROMISE);
      expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert.suspiciousPeerId).toBe('suspicious-peer-123');
      expect(alert.reporterId).toBe('reporter-peer-456');
      expect(alert.signature).toBeInstanceOf(Uint8Array);
      expect(alert.ttl).toBe(5);
    });

    it('should generate unique alert IDs', async () => {
      const alert1 = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer1',
        'reporter',
        reporterPrivateKey,
        'Spam detected'
      );

      const alert2 = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer2',
        'reporter',
        reporterPrivateKey,
        'Spam detected'
      );

      expect(alert1.alertId).not.toBe(alert2.alertId);
    });

    it('should update reputation when creating alert', async () => {
      const initialRep = alertSystem.getPeerReputation('malicious-peer');
      expect(initialRep.score).toBe(50); // Initial reputation

      await alertSystem.createAlert(
        SecurityAlertType.MALICIOUS_ACTIVITY,
        'malicious-peer',
        'reporter',
        reporterPrivateKey,
        'Malicious behavior detected',
        AlertSeverity.HIGH
      );

      const updatedRep = alertSystem.getPeerReputation('malicious-peer');
      expect(updatedRep.score).toBeLessThan(50);
      expect(updatedRep.negativeReports).toBe(1);
      expect(updatedRep.activeAlerts.length).toBe(1);
    });
  });

  describe('Alert Processing', () => {
    it('should verify and accept valid alert', async () => {
      const alert = await alertSystem.createAlert(
        SecurityAlertType.PROTOCOL_VIOLATION,
        'bad-peer',
        'reporter',
        reporterPrivateKey,
        'Protocol violation detected'
      );

      // Create new system to simulate receiving from network
      const receivingSystem = new PeerSecurityAlertSystem();
      const verification = await receivingSystem.processAlert(alert, reporterPublicKey);

      expect(verification.signatureValid).toBe(true);
      expect(verification.alert.alertId).toBe(alert.alertId);
    });

    it('should reject alert with invalid signature', async () => {
      const alert = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Test'
      );

      // Tamper with signature
      alert.signature = new Uint8Array(64).fill(0);

      const receivingSystem = new PeerSecurityAlertSystem();
      const verification = await receivingSystem.processAlert(alert, reporterPublicKey);

      expect(verification.signatureValid).toBe(false);
    });

    it('should not process duplicate alerts', async () => {
      const alert = await alertSystem.createAlert(
        SecurityAlertType.SYBIL_ATTACK,
        'sybil-peer',
        'reporter',
        reporterPrivateKey,
        'Sybil attack detected'
      );

      const verification1 = await alertSystem.processAlert(alert, reporterPublicKey);
      const verification2 = await alertSystem.processAlert(alert, reporterPublicKey);

      expect(verification1.signatureValid).toBe(true);
      expect(verification2.signatureValid).toBe(true);
      
      // Should only have one copy
      const alerts = alertSystem.getAlertsForPeer('sybil-peer');
      expect(alerts.length).toBe(1);
    });
  });

  describe('Reputation Management', () => {
    it('should decrease reputation for critical alerts', async () => {
      await alertSystem.createAlert(
        SecurityAlertType.IDENTITY_COMPROMISE,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Critical issue',
        AlertSeverity.CRITICAL
      );

      const rep = alertSystem.getPeerReputation('peer');
      expect(rep.score).toBe(30); // 50 - 20 for critical
    });

    it('should decrease reputation less for low severity', async () => {
      await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Minor spam',
        AlertSeverity.LOW
      );

      const rep = alertSystem.getPeerReputation('peer');
      expect(rep.score).toBe(45); // 50 - 5 for low
    });

    it('should accumulate multiple negative reports', async () => {
      await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter1',
        reporterPrivateKey,
        'Spam',
        AlertSeverity.MEDIUM
      );

      await alertSystem.createAlert(
        SecurityAlertType.PROTOCOL_VIOLATION,
        'peer',
        'reporter2',
        reporterPrivateKey,
        'Violation',
        AlertSeverity.MEDIUM
      );

      const rep = alertSystem.getPeerReputation('peer');
      expect(rep.negativeReports).toBe(2);
      expect(rep.score).toBe(30); // 50 - 10 - 10
    });

    it('should recommend blocking peers with low reputation', () => {
      alertSystem.getPeerReputation('good-peer'); // Will have default 50
      
      // Manually set low reputation
      const badRep = alertSystem.getPeerReputation('bad-peer');
      badRep.score = 15;

      expect(alertSystem.shouldBlockPeer('good-peer')).toBe(false);
      expect(alertSystem.shouldBlockPeer('bad-peer')).toBe(true);
      expect(alertSystem.shouldBlockPeer('bad-peer', 10)).toBe(false); // Custom threshold
    });
  });

  describe('Alert Revocation', () => {
    it('should allow original reporter to revoke alert', async () => {
      const originalAlert = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter',
        reporterPrivateKey,
        'False alarm',
        AlertSeverity.MEDIUM
      );

      const revocationAlert = await alertSystem.revokeAlert(
        originalAlert.alertId,
        'reporter',
        reporterPrivateKey,
        'Mistake - peer was legitimate'
      );

      expect(revocationAlert).toBeDefined();
      expect(revocationAlert!.type).toBe(SecurityAlertType.ALERT_REVOKED);
      expect(revocationAlert!.evidence?.revokedAlertId).toBe(originalAlert.alertId);
    });

    it('should not allow non-reporter to revoke alert', async () => {
      const originalAlert = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter1',
        reporterPrivateKey,
        'Spam detected'
      );

      const revocationAlert = await alertSystem.revokeAlert(
        originalAlert.alertId,
        'reporter2', // Different reporter
        reporterPrivateKey,
        'Trying to revoke'
      );

      expect(revocationAlert).toBeNull();
    });

    it('should remove revoked alert from active alerts', async () => {
      const originalAlert = await alertSystem.createAlert(
        SecurityAlertType.MALICIOUS_ACTIVITY,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Malicious'
      );

      let rep = alertSystem.getPeerReputation('peer');
      expect(rep.activeAlerts.length).toBe(1);

      await alertSystem.revokeAlert(
        originalAlert.alertId,
        'reporter',
        reporterPrivateKey,
        'False positive'
      );

      rep = alertSystem.getPeerReputation('peer');
      expect(rep.activeAlerts.length).toBe(0);
    });
  });

  describe('Alert Relay', () => {
    it('should decrease TTL when preparing for relay', () => {
      const alert = {
        alertId: 'test',
        type: SecurityAlertType.SPAM_BEHAVIOR,
        severity: AlertSeverity.MEDIUM,
        suspiciousPeerId: 'peer',
        reporterId: 'reporter',
        description: 'Test',
        timestamp: Date.now(),
        ttl: 3,
        signature: new Uint8Array(64),
      };

      const relayed = alertSystem.prepareForRelay(alert);
      expect(relayed).toBeDefined();
      expect(relayed!.ttl).toBe(2);
    });

    it('should not relay alerts with TTL 1', () => {
      const alert = {
        alertId: 'test',
        type: SecurityAlertType.SPAM_BEHAVIOR,
        severity: AlertSeverity.MEDIUM,
        suspiciousPeerId: 'peer',
        reporterId: 'reporter',
        description: 'Test',
        timestamp: Date.now(),
        ttl: 1,
        signature: new Uint8Array(64),
      };

      const relayed = alertSystem.prepareForRelay(alert);
      expect(relayed).toBeNull();
    });
  });

  describe('Alert Queries', () => {
    beforeEach(async () => {
      await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer1',
        'reporter',
        reporterPrivateKey,
        'Spam'
      );

      await alertSystem.createAlert(
        SecurityAlertType.IDENTITY_COMPROMISE,
        'peer2',
        'reporter',
        reporterPrivateKey,
        'Compromised'
      );

      await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer3',
        'reporter',
        reporterPrivateKey,
        'More spam'
      );
    });

    it('should get alerts for specific peer', () => {
      const alerts = alertSystem.getAlertsForPeer('peer1');
      expect(alerts.length).toBe(1);
      expect(alerts[0].suspiciousPeerId).toBe('peer1');
    });

    it('should get alerts by type', () => {
      const spamAlerts = alertSystem.getAlertsByType(SecurityAlertType.SPAM_BEHAVIOR);
      expect(spamAlerts.length).toBe(2);

      const compromiseAlerts = alertSystem.getAlertsByType(SecurityAlertType.IDENTITY_COMPROMISE);
      expect(compromiseAlerts.length).toBe(1);
    });

    it('should provide statistics', () => {
      const stats = alertSystem.getStatistics();
      expect(stats.totalAlerts).toBe(3);
      expect(stats.alertsByType.spam).toBe(2);
      expect(stats.alertsByType.identityCompromise).toBe(1);
      expect(stats.trackedPeers).toBe(3);
    });
  });

  describe('Event Callbacks', () => {
    it('should notify listeners of new alerts', async () => {
      let receivedAlert: any = null;
      
      const unsubscribe = alertSystem.onAlertReceived((alert) => {
        receivedAlert = alert;
      });

      const testAlert = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Test'
      );

      // Process as if receiving from network
      await alertSystem.processAlert(testAlert, reporterPublicKey);

      expect(receivedAlert).toBeDefined();
      expect(receivedAlert.alertId).toBe(testAlert.alertId);

      unsubscribe();
    });

    it('should allow unsubscribing from alerts', async () => {
      let callCount = 0;
      
      const unsubscribe = alertSystem.onAlertReceived(() => {
        callCount++;
      });

      const alert = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Test'
      );

      await alertSystem.processAlert(alert, reporterPublicKey);
      expect(callCount).toBe(1);

      unsubscribe();

      const alert2 = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer2',
        'reporter',
        reporterPrivateKey,
        'Test 2'
      );

      await alertSystem.processAlert(alert2, reporterPublicKey);
      expect(callCount).toBe(1); // Should not increase
    });
  });

  describe('Helper Functions', () => {
    it('should create device theft alert', async () => {
      const alert = await createDeviceTheftAlert(
        'stolen-device-peer',
        'reporter',
        reporterPrivateKey,
        'iPhone 12 stolen from car'
      );

      expect(alert.type).toBe(SecurityAlertType.IDENTITY_COMPROMISE);
      expect(alert.severity).toBe(AlertSeverity.CRITICAL);
      expect(alert.suspiciousPeerId).toBe('stolen-device-peer');
      expect(alert.description).toContain('Device reported stolen');
      expect(alert.evidence?.reason).toBe('device_theft');
    });

    it('should create spam alert', async () => {
      const alert = await createSpamAlert(
        'spammer-peer',
        'reporter',
        reporterPrivateKey,
        150
      );

      expect(alert.type).toBe(SecurityAlertType.SPAM_BEHAVIOR);
      expect(alert.severity).toBe(AlertSeverity.MEDIUM);
      expect(alert.description).toContain('150');
      expect(alert.evidence?.messageCount).toBe(150);
    });
  });

  describe('Cleanup', () => {
    it('should remove old alerts', async () => {
      // Create alert with old timestamp
      const oldAlert = await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer',
        'reporter',
        reporterPrivateKey,
        'Old alert'
      );

      // Manually set old timestamp (8 days ago)
      oldAlert.timestamp = Date.now() - (8 * 24 * 60 * 60 * 1000);

      // Recent alert
      await alertSystem.createAlert(
        SecurityAlertType.SPAM_BEHAVIOR,
        'peer2',
        'reporter',
        reporterPrivateKey,
        'Recent alert'
      );

      const removed = alertSystem.cleanup();
      expect(removed).toBeGreaterThan(0);

      const stats = alertSystem.getStatistics();
      expect(stats.totalAlerts).toBeLessThan(2);
    });
  });
});
