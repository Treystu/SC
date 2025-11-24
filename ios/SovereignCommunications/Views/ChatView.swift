import SwiftUI

// Task 108: Create chat view
// Task 109: Implement message input
// Task 110: Create message cells

struct ChatView: View {
    let conversation: ConversationEntity
    @State private var messageText: String = ""
    @State private var messages: [MessageEntity] = []
    @FocusState private var isInputFocused: Bool
    
    // Note: For full integration, use @StateObject with a ViewModel that
    // connects to the mesh network layer and Core Data
    
    var body: some View {
        VStack(spacing: 0) {
            // Messages list
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(messages, id: \.id) { message in
                            MessageBubble(message: message)
                        }
                    }
                    .padding()
                }
                .onChange(of: messages.count) { _ in
                    if let lastMessage = messages.last {
                        withAnimation {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }
            
            // Message input
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message", text: $messageText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...5)
                    .focused($isInputFocused)
                
                Button(action: sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(messageText.isEmpty ? .gray : .blue)
                }
                .disabled(messageText.isEmpty)
            }
            .padding()
            .background(Color(UIColor.systemBackground))
        }
        .navigationTitle(conversation.contactName ?? "Chat")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            loadMessages()
        }
    }
    
    private func sendMessage() {
        guard !messageText.isEmpty else { return }
        
        // Save to Core Data (persistence layer)
        let newMessage = MessageEntity(context: CoreDataStack.shared.viewContext)
        newMessage.id = UUID().uuidString
        newMessage.conversationId = conversation.id
        newMessage.content = messageText
        newMessage.timestamp = Date()
        newMessage.isSent = true
        newMessage.status = "sent"
        
        do {
            try CoreDataStack.shared.viewContext.save()
            messages.append(newMessage)
            messageText = ""
            
            // TODO: For full integration, send via mesh network:
            // let meshNetwork = MeshNetworkManager.shared
            // meshNetwork.sendMessage(to: conversation.id, content: messageText)
        } catch {
            print("Error saving message: \(error)")
        }
    }
    
    private func loadMessages() {
        let request = MessageEntity.fetchRequest()
        request.predicate = NSPredicate(format: "conversationId == %@", conversation.id ?? "")
        request.sortDescriptors = [NSSortDescriptor(keyPath: \MessageEntity.timestamp, ascending: true)]
        
        do {
            messages = try CoreDataStack.shared.viewContext.fetch(request)
        } catch {
            print("Error loading messages: \(error)")
        }
    }
}

struct MessageBubble: View {
    let message: MessageEntity
    
    var body: some View {
        HStack {
            if message.isSent {
                Spacer()
            }
            
            VStack(alignment: message.isSent ? .trailing : .leading, spacing: 4) {
                Text(message.content ?? "")
                    .padding(12)
                    .background(message.isSent ? Color.blue : Color(UIColor.secondarySystemBackground))
                    .foregroundColor(message.isSent ? .white : .primary)
                    .cornerRadius(16)
                
                HStack(spacing: 4) {
                    Text(formatTimestamp(message.timestamp))
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    if message.isSent {
                        statusIndicator(for: message.status)
                    }
                }
            }
            
            if !message.isSent {
                Spacer()
            }
        }
    }
    
    private func formatTimestamp(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    
    @ViewBuilder
    private func statusIndicator(for status: String?) -> some View {
        switch status {
        case "pending":
            Image(systemName: "clock")
                .font(.caption2)
                .foregroundColor(.secondary)
        case "sent":
            Image(systemName: "checkmark")
                .font(.caption2)
                .foregroundColor(.secondary)
        case "delivered", "read":
            Image(systemName: "checkmark.circle.fill")
                .font(.caption2)
                .foregroundColor(.blue)
        default:
            EmptyView()
        }
    }
}

#Preview {
    NavigationView {
        ChatView(conversation: ConversationEntity())
    }
}
