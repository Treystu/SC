/**
 * Security Alerts UI Component
 * 
 * Displays security alerts from peers in the mesh network and allows
 * users to report security incidents.
 */

import { getDatabase } from '../storage/database';
import React, { useState, useEffect } from 'react';
import {
  SecurityAlert,
  SecurityAlertType,
  AlertSeverity,
  PeerSecurityAlertSystem,
} from '@sc/core';

interface SecurityAlertsProps {
  alertSystem: PeerSecurityAlertSystem;
  currentPeerId: string;
}

export const SecurityAlerts: React.FC<SecurityAlertsProps> = ({
  alertSystem,
  currentPeerId,
}) => {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);

  useEffect(() => {
    // Subscribe to new alerts
    const unsubscribe = alertSystem.onAlertReceived((alert) => {
      setAlerts((prev) => [alert, ...prev]);

      // Show notification for high/critical alerts
      if (alert.severity === AlertSeverity.HIGH || alert.severity === AlertSeverity.CRITICAL) {
        showNotification(alert);
      }
    });

    // Load existing alerts
    // Note: Would need to add a method to get all alerts
    // For now, we'll populate as they come in
    // const stats = alertSystem.getStatistics(); // Uncomment when needed

    return unsubscribe;
  }, [alertSystem]);

  const showNotification = (alert: SecurityAlert) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Security Alert', {
        body: `${getSeverityLabel(alert.severity)}: ${alert.description}`,
        icon: '/alert-icon.png',
        tag: alert.alertId,
      });
    }
  };

  const getSeverityColor = (severity: AlertSeverity): string => {
    switch (severity) {
      case AlertSeverity.CRITICAL: return 'bg-red-100 border-red-500 text-red-900';
      case AlertSeverity.HIGH: return 'bg-orange-100 border-orange-500 text-orange-900';
      case AlertSeverity.MEDIUM: return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      case AlertSeverity.LOW: return 'bg-blue-100 border-blue-500 text-blue-900';
      case AlertSeverity.INFO: return 'bg-gray-100 border-gray-500 text-gray-900';
      default: return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const getSeverityLabel = (severity: AlertSeverity): string => {
    return severity.charAt(0) + severity.slice(1).toLowerCase();
  };

  const getAlertTypeLabel = (type: SecurityAlertType): string => {
    switch (type) {
      case SecurityAlertType.IDENTITY_COMPROMISE: return 'Identity Compromised';
      case SecurityAlertType.SPAM_BEHAVIOR: return 'Spam Detected';
      case SecurityAlertType.PROTOCOL_VIOLATION: return 'Protocol Violation';
      case SecurityAlertType.SIGNATURE_ANOMALY: return 'Signature Anomaly';
      case SecurityAlertType.SYBIL_ATTACK: return 'Sybil Attack';
      case SecurityAlertType.ECLIPSE_ATTACK: return 'Eclipse Attack';
      case SecurityAlertType.MALICIOUS_ACTIVITY: return 'Malicious Activity';
      case SecurityAlertType.ALERT_REVOKED: return 'Alert Revoked';
      default: return type;
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="security-alerts-container p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Security Alerts</h2>
        <button
          onClick={() => setShowReportDialog(true)}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Report Security Issue
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No security alerts</p>
          <p className="text-sm mt-2">The mesh network is secure</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.alertId}
              className={`border-l-4 p-4 rounded shadow ${getSeverityColor(alert.severity)}`}
              onClick={() => setSelectedAlert(alert)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold">{getAlertTypeLabel(alert.type)}</span>
                    <span className="text-xs px-2 py-1 rounded bg-white bg-opacity-50">
                      {getSeverityLabel(alert.severity)}
                    </span>
                  </div>
                  <p className="text-sm mb-2">{alert.description}</p>
                  <div className="text-xs opacity-75">
                    <div>Suspicious Peer: {alert.suspiciousPeerId.substring(0, 16)}...</div>
                    <div>Reported by: {alert.reporterId.substring(0, 16)}...</div>
                    <div>{formatTimestamp(alert.timestamp)}</div>
                  </div>
                </div>
                <button
                  className="text-xs underline opacity-75 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAlert(alert);
                  }}
                >
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showReportDialog && (
        <ReportSecurityIssueDialog
          alertSystem={alertSystem}
          currentPeerId={currentPeerId}
          onClose={() => setShowReportDialog(false)}
        />
      )}

      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          alertSystem={alertSystem}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
};

interface ReportDialogProps {
  alertSystem: PeerSecurityAlertSystem;
  currentPeerId: string;
  onClose: () => void;
}

const ReportSecurityIssueDialog: React.FC<ReportDialogProps> = ({
  alertSystem,
  currentPeerId,
  onClose,
}) => {
  const [alertType, setAlertType] = useState<SecurityAlertType>(SecurityAlertType.SPAM_BEHAVIOR);
  const [severity, setSeverity] = useState<AlertSeverity>(AlertSeverity.MEDIUM);
  const [suspiciousPeerId, setSuspiciousPeerId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Get private key from secure storage
      const db = getDatabase();
      const identity = await db.getPrimaryIdentity();

      if (!identity) {
        throw new Error('No identity found to sign alert');
      }

      const privateKey = identity.privateKey;

      await alertSystem.createAlert(
        alertType,
        suspiciousPeerId,
        currentPeerId,
        privateKey,
        description,
        severity
      );

      alert('Security alert submitted successfully');
      onClose();
    } catch (error) {
      console.error('Failed to submit alert:', error);
      alert('Failed to submit alert. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Report Security Issue</h3>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Alert Type
            </label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value as SecurityAlertType)}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value={SecurityAlertType.SPAM_BEHAVIOR}>Spam Behavior</option>
              <option value={SecurityAlertType.IDENTITY_COMPROMISE}>Identity Compromised</option>
              <option value={SecurityAlertType.PROTOCOL_VIOLATION}>Protocol Violation</option>
              <option value={SecurityAlertType.SIGNATURE_ANOMALY}>Signature Anomaly</option>
              <option value={SecurityAlertType.SYBIL_ATTACK}>Sybil Attack</option>
              <option value={SecurityAlertType.MALICIOUS_ACTIVITY}>Malicious Activity</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as AlertSeverity)}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value={AlertSeverity.INFO}>Info</option>
              <option value={AlertSeverity.LOW}>Low</option>
              <option value={AlertSeverity.MEDIUM}>Medium</option>
              <option value={AlertSeverity.HIGH}>High</option>
              <option value={AlertSeverity.CRITICAL}>Critical</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Suspicious Peer ID
            </label>
            <input
              type="text"
              value={suspiciousPeerId}
              onChange={(e) => setSuspiciousPeerId(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Enter peer ID"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows={4}
              placeholder="Describe the security issue..."
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Alert'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AlertDetailsProps {
  alert: SecurityAlert;
  alertSystem: PeerSecurityAlertSystem;
  onClose: () => void;
}

const AlertDetailsModal: React.FC<AlertDetailsProps> = ({
  alert,
  alertSystem,
  onClose,
}) => {
  const reputation = alertSystem.getPeerReputation(alert.suspiciousPeerId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-bold">Alert Details</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-medium text-sm text-gray-600">Alert ID</label>
            <p className="font-mono text-sm">{alert.alertId}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">Type</label>
            <p>{alert.type}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">Severity</label>
            <p>{alert.severity}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">Suspicious Peer</label>
            <p className="font-mono text-sm">{alert.suspiciousPeerId}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">Reported By</label>
            <p className="font-mono text-sm">{alert.reporterId}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">Description</label>
            <p>{alert.description}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">Timestamp</label>
            <p>{new Date(alert.timestamp).toLocaleString()}</p>
          </div>

          <div>
            <label className="font-medium text-sm text-gray-600">TTL (hops remaining)</label>
            <p>{alert.ttl}</p>
          </div>

          {alert.evidence && (
            <div>
              <label className="font-medium text-sm text-gray-600">Evidence</label>
              <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
                {JSON.stringify(alert.evidence, null, 2)}
              </pre>
            </div>
          )}

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Peer Reputation</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Score:</span>{' '}
                <span className={reputation.score < 30 ? 'text-red-600 font-bold' : ''}>
                  {reputation.score}/100
                </span>
              </div>
              <div>
                <span className="text-gray-600">Negative Reports:</span> {reputation.negativeReports}
              </div>
              <div>
                <span className="text-gray-600">Positive Reports:</span> {reputation.positiveReports}
              </div>
              <div>
                <span className="text-gray-600">Active Alerts:</span> {reputation.activeAlerts.length}
              </div>
            </div>
          </div>

          {alertSystem.shouldBlockPeer(alert.suspiciousPeerId) && (
            <div className="bg-red-100 border border-red-500 text-red-900 p-3 rounded">
              <strong>⚠️ Recommendation:</strong> Block this peer due to low reputation score.
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecurityAlerts;
