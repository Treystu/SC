// Wakeup Protocol - Request/Response types

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Wakeup token for push notifications
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WakeupToken {
    /// Push notification token (platform-specific)
    pub token: String,
    /// Token creation timestamp
    pub created_at: u64,
}

impl WakeupToken {
    pub fn new(token: String) -> Self {
        Self {
            token,
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    /// Check if token is expired
    pub fn is_expired(&self, expiry: Duration) -> bool {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        now.saturating_sub(self.created_at) > expiry.as_secs()
    }
}

/// Request to delegate message listening
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeupRequest {
    /// Delegate peer ID
    pub delegate_id: String,
    /// Wakeup token for push notifications
    pub token: WakeupToken,
    /// Token expiry duration (seconds)
    pub expiry_secs: u64,
    /// Request timestamp
    pub timestamp: u64,
}

impl WakeupRequest {
    pub fn new(delegate_id: String, token: WakeupToken, expiry: Duration) -> Self {
        Self {
            delegate_id,
            token,
            expiry_secs: expiry.as_secs(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(data)
    }
}

/// Response to wakeup request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeupResponse {
    /// Whether request was accepted
    pub accepted: bool,
    /// Optional message (e.g., rejection reason)
    pub message: Option<String>,
    /// Delegate peer ID
    pub delegate_id: String,
}

impl WakeupResponse {
    pub fn accepted(delegate_id: String) -> Self {
        Self {
            accepted: true,
            message: None,
            delegate_id,
        }
    }

    pub fn rejected(delegate_id: String, reason: String) -> Self {
        Self {
            accepted: false,
            message: Some(reason),
            delegate_id,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(data)
    }
}

/// Message targeted at a sleeping node (to trigger wakeup)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WakeupTrigger {
    /// Target peer ID (the sleeping node)
    pub target_peer_id: String,
    /// Message that triggered the wakeup
    pub message_data: Vec<u8>,
    /// Token to match for push notification
    pub token: WakeupToken,
}

impl WakeupTrigger {
    pub fn new(target_peer_id: String, message_data: Vec<u8>, token: WakeupToken) -> Self {
        Self {
            target_peer_id,
            message_data,
            token,
        }
    }

    /// Serialize to bytes
    pub fn to_bytes(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    /// Deserialize from bytes
    pub fn from_bytes(data: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wakeup_token_creation() {
        let token = WakeupToken::new("push_token_123".to_string());
        assert_eq!(token.token, "push_token_123");
        assert!(!token.is_expired(Duration::from_secs(3600)));
    }

    #[test]
    fn test_wakeup_token_expiry() {
        let mut token = WakeupToken::new("test".to_string());
        // Set created_at to 2 hours ago
        token.created_at -= 7200;

        assert!(token.is_expired(Duration::from_secs(3600))); // 1 hour expiry
        assert!(!token.is_expired(Duration::from_secs(10800))); // 3 hour expiry
    }

    #[test]
    fn test_wakeup_request_serialization() {
        let token = WakeupToken::new("token_123".to_string());
        let request = WakeupRequest::new(
            "delegate1".to_string(),
            token,
            Duration::from_secs(3600),
        );

        let bytes = request.to_bytes().unwrap();
        let decoded = WakeupRequest::from_bytes(&bytes).unwrap();

        assert_eq!(decoded.delegate_id, request.delegate_id);
        assert_eq!(decoded.token, request.token);
        assert_eq!(decoded.expiry_secs, request.expiry_secs);
    }

    #[test]
    fn test_wakeup_response() {
        let accepted = WakeupResponse::accepted("delegate1".to_string());
        assert!(accepted.accepted);
        assert!(accepted.message.is_none());

        let rejected = WakeupResponse::rejected(
            "delegate1".to_string(),
            "Too many delegations".to_string(),
        );
        assert!(!rejected.accepted);
        assert!(rejected.message.is_some());
    }

    #[test]
    fn test_wakeup_trigger() {
        let token = WakeupToken::new("token_123".to_string());
        let trigger = WakeupTrigger::new(
            "sleeping_peer".to_string(),
            vec![1, 2, 3, 4],
            token,
        );

        let bytes = trigger.to_bytes().unwrap();
        let decoded = WakeupTrigger::from_bytes(&bytes).unwrap();

        assert_eq!(decoded.target_peer_id, trigger.target_peer_id);
        assert_eq!(decoded.message_data, trigger.message_data);
    }
}
