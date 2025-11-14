//
//  AccessibilityHelper.swift
//  Sovereign Communications
//
//  Accessibility utilities for VoiceOver and Dynamic Type support
//

import Foundation
import SwiftUI

// MARK: - Accessibility Labels

extension View {
    /// Add accessibility label and hint
    func accessibilityLabel(_ label: String, hint: String? = nil) -> some View {
        self
            .accessibilityLabel(label)
            .modifier(AccessibilityHintModifier(hint: hint))
    }
    
    /// Mark as accessibility element with custom traits
    func accessibilityElement(
        label: String,
        hint: String? = nil,
        traits: AccessibilityTraits = [],
        value: String? = nil
    ) -> some View {
        self
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
            .modifier(AccessibilityHintModifier(hint: hint))
            .modifier(AccessibilityValueModifier(value: value))
            .accessibilityAddTraits(traits)
    }
}

struct AccessibilityHintModifier: ViewModifier {
    let hint: String?
    
    func body(content: Content) -> some View {
        if let hint = hint {
            content.accessibilityHint(hint)
        } else {
            content
        }
    }
}

struct AccessibilityValueModifier: ViewModifier {
    let value: String?
    
    func body(content: Content) -> some View {
        if let value = value {
            content.accessibilityValue(value)
        } else {
            content
        }
    }
}

// MARK: - Dynamic Type Support

extension View {
    /// Enable dynamic type with scaling limits
    func dynamicTypeSize(min: DynamicTypeSize = .small, max: DynamicTypeSize = .accessibility3) -> some View {
        self.dynamicTypeSize(min...max)
    }
}

// MARK: - Accessibility Manager

class AccessibilityManager: ObservableObject {
    static let shared = AccessibilityManager()
    
    @Published var isVoiceOverRunning = UIAccessibility.isVoiceOverRunning
    @Published var isBoldTextEnabled = UIAccessibility.isBoldTextEnabled
    @Published var isReduceMotionEnabled = UIAccessibility.isReduceMotionEnabled
    @Published var isReduceTransparencyEnabled = UIAccessibility.isReduceTransparencyEnabled
    @Published var preferredContentSizeCategory = UIApplication.shared.preferredContentSizeCategory
    
    private init() {
        setupNotifications()
    }
    
    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(voiceOverStatusChanged),
            name: UIAccessibility.voiceOverStatusDidChangeNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(boldTextStatusChanged),
            name: UIAccessibility.boldTextStatusDidChangeNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(reduceMotionStatusChanged),
            name: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(contentSizeCategoryChanged),
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )
    }
    
    @objc private func voiceOverStatusChanged() {
        DispatchQueue.main.async {
            self.isVoiceOverRunning = UIAccessibility.isVoiceOverRunning
        }
    }
    
    @objc private func boldTextStatusChanged() {
        DispatchQueue.main.async {
            self.isBoldTextEnabled = UIAccessibility.isBoldTextEnabled
        }
    }
    
    @objc private func reduceMotionStatusChanged() {
        DispatchQueue.main.async {
            self.isReduceMotionEnabled = UIAccessibility.isReduceMotionEnabled
        }
    }
    
    @objc private func contentSizeCategoryChanged() {
        DispatchQueue.main.async {
            self.preferredContentSizeCategory = UIApplication.shared.preferredContentSizeCategory
        }
    }
    
    // MARK: - Utilities
    
    /// Check if large content size is enabled
    var isLargeContentSize: Bool {
        preferredContentSizeCategory >= .accessibilityMedium
    }
    
    /// Announce message for VoiceOver
    func announce(_ message: String, priority: UIAccessibility.Notification = .announcement) {
        UIAccessibility.post(notification: priority, argument: message)
    }
    
    /// Announce screen change for VoiceOver
    func announceScreenChange(_ message: String? = nil) {
        UIAccessibility.post(notification: .screenChanged, argument: message)
    }
    
    /// Announce layout change for VoiceOver
    func announceLayoutChange(_ message: String? = nil) {
        UIAccessibility.post(notification: .layoutChanged, argument: message)
    }
}

// MARK: - Accessibility-Aware Views

/// Button with proper accessibility support
struct AccessibleButton<Label: View>: View {
    let action: () -> Void
    let label: String
    let hint: String?
    let content: () -> Label
    
    init(
        _ label: String,
        hint: String? = nil,
        action: @escaping () -> Void,
        @ViewBuilder content: @escaping () -> Label
    ) {
        self.label = label
        self.hint = hint
        self.action = action
        self.content = content
    }
    
    var body: some View {
        Button(action: action) {
            content()
        }
        .accessibilityElement(
            label: label,
            hint: hint,
            traits: .isButton
        )
    }
}

/// Text field with proper accessibility support
struct AccessibleTextField: View {
    let label: String
    let hint: String?
    @Binding var text: String
    
    var body: some View {
        TextField(label, text: $text)
            .accessibilityElement(
                label: label,
                hint: hint,
                value: text.isEmpty ? "Empty" : text
            )
    }
}

// MARK: - Example Usage

struct AccessibilityExampleView: View {
    @StateObject private var accessibilityManager = AccessibilityManager.shared
    @State private var messageText = ""
    
    var body: some View {
        VStack(spacing: 20) {
            // Status indicators
            if accessibilityManager.isVoiceOverRunning {
                Label("VoiceOver is running", systemImage: "speaker.wave.2.fill")
                    .foregroundColor(.blue)
            }
            
            // Accessible button
            AccessibleButton(
                "Send Message",
                hint: "Double tap to send your message"
            ) {
                sendMessage()
            } content: {
                Label("Send", systemImage: "arrow.up.circle.fill")
                    .padding()
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            
            // Accessible text field
            AccessibleTextField(
                label: "Message",
                hint: "Type your message here",
                text: $messageText
            )
            .textFieldStyle(.roundedBorder)
            .padding()
            
            // Dynamic type support
            Text("This text scales with Dynamic Type")
                .dynamicTypeSize(min: .small, max: .accessibility3)
                .padding()
        }
        .padding()
    }
    
    private func sendMessage() {
        accessibilityManager.announce("Message sent")
    }
}
