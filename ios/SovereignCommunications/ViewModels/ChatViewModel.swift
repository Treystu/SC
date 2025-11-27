import Foundation
import CoreData
import Combine

class ChatViewModel: ObservableObject {
    @Published var messages: [MessageEntity] = []
    @Published var messageText: String = ""
    
    private let conversationId: String
    private let context = CoreDataStack.shared.viewContext
    
    init(conversationId: String) {
        self.conversationId = conversationId
        loadMessages()
        
        // Listen for new messages
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(contextDidChange),
            name: .NSManagedObjectContextObjectsDidChange,
            object: context
        )
    }
    
    @objc private func contextDidChange(notification: NSNotification) {
        // Refresh messages if changes affect this conversation
        // For simplicity, we just reload all messages for now
        // In production, optimize to only update if relevant entities changed
        loadMessages()
    }
    
    func loadMessages() {
        let request = MessageEntity.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@", conversationId)
        request.sortDescriptors = [NSSortDescriptor(keyPath: \MessageEntity.timestamp, ascending: true)]
        
        do {
            messages = try context.fetch(request)
        } catch {
            print("Error loading messages: \(error)")
        }
    }
    
    func sendMessage() {
        guard !messageText.isEmpty else { return }
        
        // Save to Core Data (persistence layer)
        let newMessage = MessageEntity(context: context)
        newMessage.id = UUID().uuidString
        newMessage.conversationId = conversationId
        newMessage.content = messageText
        newMessage.timestamp = Date()
        newMessage.isSent = true
        newMessage.status = "sent"
        
        do {
            try context.save()
            messageText = ""
            
            // Send via mesh network
            MeshNetworkManager.shared.sendMessage(recipientId: conversationId, messageContent: newMessage.content ?? "")
        } catch {
            print("Error saving message: \(error)")
        }
    }
}