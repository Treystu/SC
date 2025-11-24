import SwiftUI
import CoreData

struct ConversationListView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \ConversationEntity.lastMessageTimestamp, ascending: false)],
        animation: .default)
    private var conversations: FetchedResults<ConversationEntity>
    
    var body: some View {
        NavigationView {
            Group {
                if conversations.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "message.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        Text("No conversations yet")
                            .font(.title2)
                            .fontWeight(.semibold)
                        Text("Add a contact to start messaging")
                            .foregroundColor(.secondary)
                    }
                    .padding()
                } else {
                    List {
                        ForEach(conversations) { conversation in
                            ConversationRow(conversation: conversation)
                        }
                    }
                    .listStyle(InsetGroupedListStyle())
                }
            }
            .navigationTitle("Conversations")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    ConnectionStatusBadge()
                }
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {}) {
                        Image(systemName: "plus.circle.fill")
                    }
                }
            }
        }
    }
}

struct ConversationRow: View {
    let conversation: ConversationEntity
    
    var body: some View {
        HStack {
            Circle()
                .fill(Color.green)
                .frame(width: 50, height: 50)
                .overlay(
                    Text(conversation.contact?.displayName?.prefix(1).uppercased() ?? "?")
                        .foregroundColor(.white)
                        .font(.title3)
                        .fontWeight(.semibold)
                )
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(conversation.contact?.displayName ?? "Unknown")
                        .font(.headline)
                    Spacer()
                    if let timestamp = conversation.lastMessageTimestamp {
                        Text(timestamp, style: .relative)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                
                if let lastMessage = conversation.lastMessage {
                    Text(lastMessage)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            
            if conversation.unreadCount > 0 {
                Spacer()
                Circle()
                    .fill(Color.green)
                    .frame(width: 24, height: 24)
                    .overlay(
                        Text("\(conversation.unreadCount)")
                            .foregroundColor(.white)
                            .font(.caption2)
                            .fontWeight(.bold)
                    )
            }
        }
        .padding(.vertical, 4)
    }
}
