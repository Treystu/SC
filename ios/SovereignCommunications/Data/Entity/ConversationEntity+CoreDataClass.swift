import Foundation
import CoreData

@objc(ConversationEntity)
public class ConversationEntity: NSManagedObject {
    @NSManaged public var id: String
    @NSManaged public var contactId: String
    @NSManaged public var lastMessage: String?
    @NSManaged public var lastMessageTimestamp: Date?
    @NSManaged public var unreadCount: Int32
    @NSManaged public var isPinned: Bool
    @NSManaged public var messages: NSSet?
    @NSManaged public var contact: ContactEntity?
    
    convenience init(context: NSManagedObjectContext,
                     id: String,
                     contactId: String,
                     unreadCount: Int32 = 0,
                     isPinned: Bool = false) {
        self.init(context: context)
        self.id = id
        self.contactId = contactId
        self.unreadCount = unreadCount
        self.isPinned = isPinned
    }
}

extension ConversationEntity {
    static func fetchRequest() -> NSFetchRequest<ConversationEntity> {
        return NSFetchRequest<ConversationEntity>(entityName: "ConversationEntity")
    }
    
    var messagesArray: [MessageEntity] {
        let set = messages as? Set<MessageEntity> ?? []
        return set.sorted { $0.timestamp < $1.timestamp }
    }
}
