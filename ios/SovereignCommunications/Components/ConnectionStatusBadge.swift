import SwiftUI
import CoreBluetooth

struct ConnectionStatusBadge: View {
    @ObservedObject private var meshManager = MeshNetworkManager.shared
    
    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            
            Text(statusText)
                .font(.caption)
                .fontWeight(.medium)
            
            if meshManager.connectedPeers.count > 0 {
                Text("(\(meshManager.connectedPeers.count))")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color(UIColor.systemGray6))
        .cornerRadius(12)
        .onAppear {
            // Ensure stats are up to date
            _ = meshManager.getStats()
        }
    }
    
    private var statusColor: Color {
        if !meshManager.connectedPeers.isEmpty {
            return .green
        } else if meshManager.discoveredPeers.count > 0 {
            return .yellow
        } else {
            return .red
        }
    }
    
    private var statusText: String {
        if !meshManager.connectedPeers.isEmpty {
            return "Connected"
        } else if meshManager.discoveredPeers.count > 0 {
            return "Scanning..."
        } else {
            return "Offline"
        }
    }
}

struct ConnectionStatusBadge_Previews: PreviewProvider {
    static var previews: some View {
        VStack {
            ConnectionStatusBadge()
        }
    }
}
