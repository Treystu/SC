import SwiftUI

struct ConnectionStatusBadge: View {
    // TODO: Connect to actual network status
    @State private var isConnected = false
    @State private var peerCount = 0
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(isConnected ? Color.green : Color.red)
                .frame(width: 8, height: 8)
            
            Text(isConnected ? "Connected" : "Offline")
                .font(.caption)
                .fontWeight(.medium)
            
            if isConnected && peerCount > 0 {
                Text("(\(peerCount))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
    }
}

struct ConnectionStatusBadge_Previews: PreviewProvider {
    static var previews: some View {
        VStack {
            ConnectionStatusBadge()
        }
    }
}
