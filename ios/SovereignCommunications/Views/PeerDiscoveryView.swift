import SwiftUI
import CoreBluetooth
import Combine

struct PeerDiscoveryView: View {
    @StateObject private var viewModel = PeerDiscoveryViewModel()

    var body: some View {
        List {
            Section(header: Text("Discovered Peers")) {
                if viewModel.peers.isEmpty {
                    Text("Scanning for peers...")
                } else {
                    ForEach(viewModel.peers, id: \.self) { peer in
                        HStack {
                            Text(peer.name ?? "Unknown")
                            Spacer()
                            Button("Connect") {
                                viewModel.connect(to: peer)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Peer Discovery")
    }
}

class PeerDiscoveryViewModel: ObservableObject {
    @Published var peers: [CBPeripheral] = []
    private var cancellable: AnyCancellable?

    init() {
        cancellable = MeshNetworkManager.shared.$discoveredPeers.sink { peers in
            self.peers = peers
        }
    }

    func connect(to peer: CBPeripheral) {
        MeshNetworkManager.shared.connect(to: peer)
    }
}
