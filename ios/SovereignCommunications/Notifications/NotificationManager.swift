//
//  NotificationManager.swift
//  Sovereign Communications
//
//  Enhanced notification management for iOS with rich content and background support
//

import Foundation
import UserNotifications
import UIKit
import os.log

/// Manages local and push notifications with rich content and actions
class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    
    private let notificationCenter = UNUserNotificationCenter.current()
    private let logger = Logger(subsystem: "com.sovereign.communications", category: "Notifications")
    
    // Notification categories
    private let messageCategoryIdentifier = "MESSAGE_CATEGORY"
    private let fileTransferCategoryIdentifier = "FILE_TRANSFER_CATEGORY"
    private let callCategoryIdentifier = "CALL_CATEGORY"
    
    private override init() {
        super.init()
        notificationCenter.delegate = self
        setupNotificationCategories()
    }
    
    // MARK: - Setup
    
    /// Request notification permissions from user with all options
    func requestAuthorization(completion: @escaping (Bool, Error?) -> Void) {
        let options: UNAuthorizationOptions = [.alert, .sound, .badge, .provisional, .criticalAlert]
        
        notificationCenter.requestAuthorization(options: options) { granted, error in
            if let error = error {
                self.logger.error("Notification authorization error: \(error.localizedDescription)")
            } else {
                self.logger.info("Notification authorization: \(granted ? "granted" : "denied")")
            }
            
            DispatchQueue.main.async {
                completion(granted, error)
            }
        }
    }
    
    /// Setup notification categories and actions
    private func setupNotificationCategories() {
        var categories = Set<UNNotificationCategory>()
        
        // Message category
        let replyAction = UNTextInputNotificationAction(
            identifier: "REPLY_ACTION",
            title: "Reply",
            options: [],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Type your message..."
        )
        
        let markReadAction = UNNotificationAction(
            identifier: "MARK_READ_ACTION",
            title: "Mark as Read",
            options: []
        )
        
        let muteAction = UNNotificationAction(
            identifier: "MUTE_ACTION",
            title: "Mute",
            options: [.destructive]
        )
        
        let messageCategory = UNNotificationCategory(
            identifier: messageCategoryIdentifier,
            actions: [replyAction, markReadAction, muteAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )
        categories.insert(messageCategory)
        
        // File transfer category
        let acceptFileAction = UNNotificationAction(
            identifier: "ACCEPT_FILE_ACTION",
            title: "Accept",
            options: [.foreground]
        )
        
        let rejectFileAction = UNNotificationAction(
            identifier: "REJECT_FILE_ACTION",
            title: "Decline",
            options: [.destructive]
        )
        
        let fileTransferCategory = UNNotificationCategory(
            identifier: fileTransferCategoryIdentifier,
            actions: [acceptFileAction, rejectFileAction],
            intentIdentifiers: [],
            options: []
        )
        categories.insert(fileTransferCategory)
        
        // Call category
        let answerCallAction = UNNotificationAction(
            identifier: "ANSWER_CALL_ACTION",
            title: "Answer",
            options: [.foreground]
        )
        
        let declineCallAction = UNNotificationAction(
            identifier: "DECLINE_CALL_ACTION",
            title: "Decline",
            options: [.destructive]
        )
        
        let callCategory = UNNotificationCategory(
            identifier: callCategoryIdentifier,
            actions: [answerCallAction, declineCallAction],
            intentIdentifiers: [],
            options: []
        )
        categories.insert(callCategory)
        
        notificationCenter.setNotificationCategories(categories)
        logger.info("Notification categories configured")
    }
    
    // MARK: - Send Notifications
    
    /// Send a message notification with rich content
    func sendMessageNotification(
        messageId: String,
        conversationId: String,
        senderName: String,
        messageText: String,
        timestamp: Date = Date(),
        avatarImageURL: URL? = nil
    ) {
        let content = UNMutableNotificationContent()
        content.title = senderName
        content.body = messageText
        content.sound = .default
        content.categoryIdentifier = messageCategoryIdentifier
        content.threadIdentifier = conversationId
        content.badge = NSNumber(value: getAppBadgeCount() + 1)
        
        // Add user info for handling actions
        content.userInfo = [
            "messageId": messageId,
            "conversationId": conversationId,
            "senderName": senderName,
            "type": "message"
        ]
        
        // Add avatar attachment if available
        if let avatarURL = avatarImageURL,
           let attachment = try? UNNotificationAttachment(identifier: "avatar", url: avatarURL, options: nil) {
            content.attachments = [attachment]
        }
        
        // Create trigger (deliver immediately)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        
        // Create request
        let request = UNNotificationRequest(
            identifier: "message_\(messageId)",
            content: content,
            trigger: trigger
        )
        
        // Schedule notification
        notificationCenter.add(request) { [weak self] error in
            if let error = error {
                self?.logger.error("Failed to schedule notification: \(error.localizedDescription)")
            } else {
                self?.logger.debug("Message notification scheduled for \(senderName)")
            }
        }
    }
    
    /// Send a file transfer notification
    func sendFileTransferNotification(
        transferId: String,
        senderName: String,
        fileName: String,
        fileSize: Int64
    ) {
        let content = UNMutableNotificationContent()
        content.title = "File from \(senderName)"
        content.body = "\(fileName) (\(formatFileSize(fileSize)))"
        content.sound = .default
        content.categoryIdentifier = fileTransferCategoryIdentifier
        
        content.userInfo = [
            "transferId": transferId,
            "senderName": senderName,
            "fileName": fileName,
            "type": "fileTransfer"
        ]
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "transfer_\(transferId)",
            content: content,
            trigger: trigger
        )
        
        notificationCenter.add(request) { [weak self] error in
            if let error = error {
                self?.logger.error("Failed to schedule file transfer notification: \(error.localizedDescription)")
            }
        }
    }
    
    /// Send a call notification
    func sendCallNotification(callId: String, callerName: String) {
        let content = UNMutableNotificationContent()
        content.title = "Incoming Call"
        content.body = callerName
        content.sound = .defaultCritical // Use critical alert for calls
        content.categoryIdentifier = callCategoryIdentifier
        content.interruptionLevel = .timeSensitive
        
        content.userInfo = [
            "callId": callId,
            "callerName": callerName,
            "type": "call"
        ]
        
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let request = UNNotificationRequest(
            identifier: "call_\(callId)",
            content: content,
            trigger: trigger
        )
        
        notificationCenter.add(request) { [weak self] error in
            if let error = error {
                self?.logger.error("Failed to schedule call notification: \(error.localizedDescription)")
            }
        }
    }
    
    // MARK: - Clear Notifications
    
    /// Clear all notifications
    func clearAllNotifications() {
        notificationCenter.removeAllDeliveredNotifications()
        UIApplication.shared.applicationIconBadgeNumber = 0
        logger.debug("All notifications cleared")
    }
    
    /// Clear notifications for specific conversation
    func clearNotifications(forConversation conversationId: String) {
        notificationCenter.getDeliveredNotifications { [weak self] notifications in
            let identifiersToRemove = notifications
                .filter { notification in
                    guard let convId = notification.request.content.userInfo["conversationId"] as? String else {
                        return false
                    }
                    return convId == conversationId
                }
                .map { $0.request.identifier }
            
            self?.notificationCenter.removeDeliveredNotifications(withIdentifiers: identifiersToRemove)
            self?.logger.debug("Cleared \(identifiersToRemove.count) notifications for conversation")
        }
    }
    
    // MARK: - Badge Management
    
    private func getAppBadgeCount() -> Int {
        return UIApplication.shared.applicationIconBadgeNumber
    }
    
    func updateBadgeCount(_ count: Int) {
        UIApplication.shared.applicationIconBadgeNumber = max(0, count)
    }
    
    func incrementBadgeCount() {
        updateBadgeCount(getAppBadgeCount() + 1)
    }
    
    func decrementBadgeCount() {
        updateBadgeCount(getAppBadgeCount() - 1)
    }
    
    // MARK: - Settings
    
    /// Check current notification settings
    func checkAuthorizationStatus(completion: @escaping (UNAuthorizationStatus) -> Void) {
        notificationCenter.getNotificationSettings { settings in
            DispatchQueue.main.async {
                completion(settings.authorizationStatus)
            }
        }
    }
    
    /// Get detailed notification settings
    func getNotificationSettings(completion: @escaping (UNNotificationSettings) -> Void) {
        notificationCenter.getNotificationSettings { settings in
            DispatchQueue.main.async {
                completion(settings)
            }
        }
    }
    
    // MARK: - UNUserNotificationCenterDelegate
    
    /// Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification even when app is in foreground
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .badge, .list])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }
    
    /// Handle notification response (tap or action)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        
        guard let type = userInfo["type"] as? String else {
            completionHandler()
            return
        }
        
        switch type {
        case "message":
            handleMessageNotificationResponse(response, userInfo: userInfo)
        case "fileTransfer":
            handleFileTransferNotificationResponse(response, userInfo: userInfo)
        case "call":
            handleCallNotificationResponse(response, userInfo: userInfo)
        default:
            break
        }
        
        completionHandler()
    }
    
    // MARK: - Action Handlers
    
    private func handleMessageNotificationResponse(_ response: UNNotificationResponse, userInfo: [AnyHashable: Any]) {
        guard let conversationId = userInfo["conversationId"] as? String else { return }
        
        switch response.actionIdentifier {
        case "REPLY_ACTION":
            if let textResponse = response as? UNTextInputNotificationResponse {
                handleReply(conversationId: conversationId, messageText: textResponse.userText)
            }
            
        case "MARK_READ_ACTION":
            handleMarkAsRead(conversationId: conversationId)
            
        case "MUTE_ACTION":
            handleMuteConversation(conversationId: conversationId)
            
        case UNNotificationDefaultActionIdentifier:
            handleOpenConversation(conversationId: conversationId)
            
        default:
            break
        }
    }
    
    private func handleFileTransferNotificationResponse(_ response: UNNotificationResponse, userInfo: [AnyHashable: Any]) {
        guard let transferId = userInfo["transferId"] as? String else { return }
        
        switch response.actionIdentifier {
        case "ACCEPT_FILE_ACTION":
            NotificationCenter.default.post(
                name: NSNotification.Name("AcceptFileTransfer"),
                object: nil,
                userInfo: ["transferId": transferId]
            )
            
        case "REJECT_FILE_ACTION":
            NotificationCenter.default.post(
                name: NSNotification.Name("RejectFileTransfer"),
                object: nil,
                userInfo: ["transferId": transferId]
            )
            
        default:
            break
        }
    }
    
    private func handleCallNotificationResponse(_ response: UNNotificationResponse, userInfo: [AnyHashable: Any]) {
        guard let callId = userInfo["callId"] as? String else { return }
        
        switch response.actionIdentifier {
        case "ANSWER_CALL_ACTION":
            NotificationCenter.default.post(
                name: NSNotification.Name("AnswerCall"),
                object: nil,
                userInfo: ["callId": callId]
            )
            
        case "DECLINE_CALL_ACTION":
            NotificationCenter.default.post(
                name: NSNotification.Name("DeclineCall"),
                object: nil,
                userInfo: ["callId": callId]
            )
            
        default:
            break
        }
    }
    
    private func handleReply(conversationId: String, messageText: String) {
        NotificationCenter.default.post(
            name: NSNotification.Name("SendMessageFromNotification"),
            object: nil,
            userInfo: [
                "conversationId": conversationId,
                "messageText": messageText
            ]
        )
        clearNotifications(forConversation: conversationId)
    }
    
    private func handleMarkAsRead(conversationId: String) {
        NotificationCenter.default.post(
            name: NSNotification.Name("MarkConversationAsRead"),
            object: nil,
            userInfo: ["conversationId": conversationId]
        )
        clearNotifications(forConversation: conversationId)
    }
    
    private func handleMuteConversation(conversationId: String) {
        NotificationCenter.default.post(
            name: NSNotification.Name("MuteConversation"),
            object: nil,
            userInfo: ["conversationId": conversationId]
        )
        clearNotifications(forConversation: conversationId)
    }
    
    private func handleOpenConversation(conversationId: String) {
        NotificationCenter.default.post(
            name: NSNotification.Name("OpenConversation"),
            object: nil,
            userInfo: ["conversationId": conversationId]
        )
        clearNotifications(forConversation: conversationId)
    }
    
    // MARK: - Utilities
    
    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}
