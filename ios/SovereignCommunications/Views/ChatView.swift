import SwiftUI

// Task 108: Create chat view
// Task 109: Implement message input
// Task 110: Create message cells

struct ChatView: View {
    let conversation: ConversationEntity
    @StateObject private var viewModel: ChatViewModel
    @FocusState private var isInputFocused: Bool
    
    init(conversation: ConversationEntity) {
        self.conversation = conversation
        _viewModel = StateObject(wrappedValue: ChatViewModel(conversationId: conversation.id ?? ""))
    }
    
    var body: some View {
        VStack(spacing: 0) {
            // Messages list
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages, id: \.id) { message in
                            MessageBubble(message: message)
                        }
                    }
                    .padding()
                }
                .onChange(of: viewModel.messages.count) { _ in
                    if let lastMessage = viewModel.messages.last {
                        withAnimation {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }
            
            // Message input
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message", text: $viewModel.messageText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...5)
                    .focused($isInputFocused)
                
                Button(action: viewModel.sendMessage) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(viewModel.messageText.isEmpty ? .gray : .blue)
                }
                .disabled(viewModel.messageText.isEmpty)
            }
            .padding()
            .background(Color(UIColor.systemBackground))
        }
        .navigationTitle(conversation.contactName ?? "Chat")
        .navigationBarTitleDisplayMode(.inline)
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
