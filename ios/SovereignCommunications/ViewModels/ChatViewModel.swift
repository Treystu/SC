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
        // Optimization: Only reload if the changes involve MessageEntity objects for this conversation
        guard let userInfo = notification.userInfo else { return }
        
        let inserted = userInfo[NSInsertedObjectsKey] as? Set<NSManagedObject> ?? []
        let updated = userInfo[NSUpdatedObjectsKey] as? Set<NSManagedObject> ?? []
        let deleted = userInfo[NSDeletedObjectsKey] as? Set<NSManagedObject> ?? []
        
        let allChanges = inserted.union(updated).union(deleted)
        
        let relevantChanges = allChanges.compactMap { $0 as? MessageEntity }
            .filter { $0.conversationId == self.conversationId }
            
        if !relevantChanges.isEmpty {
            DispatchQueue.main.async {
                self.loadMessages()
            }
        }
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