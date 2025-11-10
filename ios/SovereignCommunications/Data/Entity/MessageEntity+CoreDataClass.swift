import Foundation
import CoreData

@objc(MessageEntity)
public class MessageEntity: NSManagedObject {
    @NSManaged public var id: String
    @NSManaged public var conversationId: String
    @NSManaged public var senderId: String
    @NSManaged public var content: String
    @NSManaged public var timestamp: Date
    @NSManaged public var status: String // pending, sent, delivered, read, failed
    @NSManaged public var isEncrypted: Bool
    @NSManaged public var conversation: ConversationEntity?
    
    convenience init(context: NSManagedObjectContext,
                     id: String,
                     conversationId: String,
                     senderId: String,
                     content: String,
                     timestamp: Date,
                     status: String = "pending",
                     isEncrypted: Bool = true) {
        self.init(context: context)
        self.id = id
        self.conversationId = conversationId
        self.senderId = senderId
        self.content = content
        self.timestamp = timestamp
        self.status = status
        self.isEncrypted = isEncrypted
    }
}

extension MessageEntity {
    static func fetchRequest() -> NSFetchRequest<MessageEntity> {
        return NSFetchRequest<MessageEntity>(entityName: "MessageEntity")
    }
}
