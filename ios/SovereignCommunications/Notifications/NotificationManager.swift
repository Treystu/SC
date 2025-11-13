//
//  NotificationManager.swift
//  Sovereign Communications
//
//  Notification management for iOS
//

import Foundation
import UserNotifications
import UIKit

/// Manages local notifications for the app
class NotificationManager: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationManager()
    
    private let notificationCenter = UNUserNotificationCenter.current()
    private let categoryIdentifier = "MESSAGE_CATEGORY"
    
    private override init() {
        super.init()
        notificationCenter.delegate = self
        setupNotificationCategories()
    }
    
    // MARK: - Setup
    
    /// Request notification permissions from user
    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        notificationCenter.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("Notification authorization error: \(error)")
            }
            completion(granted)
        }
    }
    
    /// Setup notification categories and actions
    private func setupNotificationCategories() {
        // Reply action (text input)
        let replyAction = UNTextInputNotificationAction(
            identifier: "REPLY_ACTION",
            title: "Reply",
            options: [],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Type your message..."
        )
        
        // Mark as read action
        let markReadAction = UNNotificationAction(
            identifier: "MARK_READ_ACTION",
            title: "Mark as Read",
            options: []
        )
        
        // Create category with actions
        let category = UNNotificationCategory(
            identifier: categoryIdentifier,
            actions: [replyAction, markReadAction],
            intentIdentifiers: [],
            options: []
        )
        
        notificationCenter.setNotificationCategories([category])
    }
    
    // MARK: - Send Notifications
    
    /// Send a message notification
    func sendMessageNotification(
        messageId: String,
        conversationId: String,
        senderName: String,
        messageText: String,
        timestamp: Date = Date()
    ) {
        let content = UNMutableNotificationContent()
        content.title = senderName
        content.body = messageText
        content.sound = .default
        content.categoryIdentifier = categoryIdentifier
        content.badge = NSNumber(value: getAppBadgeCount() + 1)
        
        // Add user info for handling actions
        content.userInfo = [
            "messageId": messageId,
            "conversationId": conversationId,
            "senderName": senderName,
            "type": "message"
        ]
        
        // Create trigger (deliver immediately)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        
        // Create request
        let request = UNNotificationRequest(
            identifier: "message_\(messageId)",
            content: content,
            trigger: trigger
        )
        
        // Schedule notification
        notificationCenter.add(request) { error in
            if let error = error {
                print("Failed to schedule notification: \(error)")
            }
        }
    }
    
    /// Clear all notifications
    func clearAllNotifications() {
        notificationCenter.removeAllDeliveredNotifications()
        UIApplication.shared.applicationIconBadgeNumber = 0
    }
    
    /// Clear notifications for specific conversation
    func clearNotifications(forConversation conversationId: String) {
        notificationCenter.getDeliveredNotifications { notifications in
            let identifiersToRemove = notifications
                .filter { notification in
                    guard let convId = notification.request.content.userInfo["conversationId"] as? String else {
                        return false
                    }
                    return convId == conversationId
                }
                .map { $0.request.identifier }
            
            self.notificationCenter.removeDeliveredNotifications(withIdentifiers: identifiersToRemove)
        }
    }
    
    // MARK: - Badge Management
    
    private func getAppBadgeCount() -> Int {
        return UIApplication.shared.applicationIconBadgeNumber
    }
    
    func updateBadgeCount(_ count: Int) {
        UIApplication.shared.applicationIconBadgeNumber = count
    }
    
    // MARK: - UNUserNotificationCenterDelegate
    
    /// Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show notification even when app is in foreground
        completionHandler([.banner, .sound, .badge])
    }
    
    /// Handle notification response (tap or action)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        
        guard let conversationId = userInfo["conversationId"] as? String else {
            completionHandler()
            return
        }
        
        switch response.actionIdentifier {
        case "REPLY_ACTION":
            // Handle inline reply
            if let textResponse = response as? UNTextInputNotificationResponse {
                let messageText = textResponse.userText
                handleReply(conversationId: conversationId, messageText: messageText)
            }
            
        case "MARK_READ_ACTION":
            // Mark conversation as read
            handleMarkAsRead(conversationId: conversationId)
            
        case UNNotificationDefaultActionIdentifier:
            // User tapped notification - open conversation
            handleOpenConversation(conversationId: conversationId)
            
        default:
            break
        }
        
        completionHandler()
    }
    
    // MARK: - Action Handlers
    
    private func handleReply(conversationId: String, messageText: String) {
        // Post notification for app to handle reply
        NotificationCenter.default.post(
            name: NSNotification.Name("SendMessageFromNotification"),
            object: nil,
            userInfo: [
                "conversationId": conversationId,
                "messageText": messageText
            ]
        )
        
        // Clear notification after reply
        clearNotifications(forConversation: conversationId)
    }
    
    private func handleMarkAsRead(conversationId: String) {
        // Post notification for app to handle mark as read
        NotificationCenter.default.post(
            name: NSNotification.Name("MarkConversationAsRead"),
            object: nil,
            userInfo: ["conversationId": conversationId]
        )
        
        // Clear notifications
        clearNotifications(forConversation: conversationId)
    }
    
    private func handleOpenConversation(conversationId: String) {
        // Post notification for app to navigate to conversation
        NotificationCenter.default.post(
            name: NSNotification.Name("OpenConversation"),
            object: nil,
            userInfo: ["conversationId": conversationId]
        )
        
        // Clear notifications
        clearNotifications(forConversation: conversationId)
    }
}
