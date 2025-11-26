import SwiftUI

class NetworkDiagnosticsViewModel: ObservableObject {
    @Published var stats: NetworkStats?
    private var timer: Timer?

    init() {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            self.fetchStats()
        }
    }

    func fetchStats() {
        stats = MeshNetworkManager.shared.getStats()
    }

    deinit {
        timer?.invalidate()
    }

    func formatBytes(_ bytes: Double) -> String {
        guard bytes > 0 else { return "0 B" }
        let k: Double = 1024
        let sizes = ["B", "KB", "MB", "GB"]
        let i = floor(log(bytes) / log(k))
        return String(format: "%.2f", bytes / pow(k, i)) + " " + sizes[Int(i)]
    }

    func formatUptime(_ seconds: TimeInterval) -> String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.day, .hour, .minute, .second]
        formatter.unitsStyle = .abbreviated
        return formatter.string(from: seconds) ?? "0s"
    }
}

struct NetworkDiagnosticsView: View {
    @StateObject private var viewModel = NetworkDiagnosticsViewModel()

    var body: some View {
        List {
            if let stats = viewModel.stats {
                Section(header: Text("Overview")) {
                    HStack {
                        Text("Connected Peers")
                        Spacer()
                        Text("\(stats.connectedPeers)")
                    }
                    HStack {
                        Text("Messages Sent")
                        Spacer()
                        Text("\(stats.messagesSent)")
                    }
                    HStack {
                        Text("Messages Received")
                        Spacer()
                        Text("\(stats.messagesReceived)")
                    }
                    HStack {
                        Text("Uptime")
                        Spacer()
                        Text(viewModel.formatUptime(stats.uptime))
                    }
                }

                Section(header: Text("Performance")) {
                    HStack {
                        Text("Latency (Avg)")
                        Spacer()
                        Text(String(format: "%.0f ms", stats.latency.average))
                    }
                    HStack {
                        Text("Latency (Min/Max)")
                        Spacer()
                        Text(String(format: "%.0f ms / %.0f ms", stats.latency.min, stats.latency.max))
                    }
                    HStack {
                        Text("Packet Loss")
                        Spacer()
                        Text(String(format: "%.2f %%", stats.packetLoss))
                    }
                }

                Section(header: Text("Bandwidth")) {
                    HStack {
                        Text("Upload")
                        Spacer()
                        Text("\(viewModel.formatBytes(stats.bandwidth.upload))/s")
                    }
                    HStack {
                        Text("Download")
                        Spacer()
                        Text("\(viewModel.formatBytes(stats.bandwidth.download))/s")
                    }
                }

                Section(header: Text("Connections")) {
                    HStack {
                        Text("BLE Connections")
                        Spacer()
                        Text("\(stats.bleConnections)")
                    }
                    HStack {
                        Text("WebRTC Connections")
                        Spacer()
                        Text("\(stats.webrtcConnections)")
                    }
                }

            } else {
                Text("Loading stats...")
            }
        }
        .navigationTitle("Network Diagnostics")
        .onAppear {
            viewModel.fetchStats()
        }
    }
}
