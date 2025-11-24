import Foundation
import CoreData

@objc(ContactEntity)
public class ContactEntity: NSManagedObject {
    @NSManaged public var id: String
    @NSManaged public var publicKey: String
    @NSManaged public var displayName: String
    @NSManaged public var lastSeen: Date?
    @NSManaged public var isVerified: Bool
    @NSManaged public var isFavorite: Bool
    @NSManaged public var conversation: ConversationEntity?
    
    convenience init(context: NSManagedObjectContext,
                     id: String,
                     publicKey: String,
                     displayName: String,
                     isVerified: Bool = false,
                     isFavorite: Bool = false) {
        self.init(context: context)
        self.id = id
        self.publicKey = publicKey
        self.displayName = displayName
        self.isVerified = isVerified
        self.isFavorite = isFavorite
    }
}

extension ContactEntity {
    static func fetchRequest() -> NSFetchRequest<ContactEntity> {
        return NSFetchRequest<ContactEntity>(entityName: "ContactEntity")
    }
}
