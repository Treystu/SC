import SwiftUI

struct FileTransferProgressView: View {
    let transfer: FileTransfer
    @State private var progress: Double = 0.0
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "doc.fill")
                    .foregroundColor(.blue)
                
                VStack(alignment: .leading) {
                    Text(transfer.fileName)
                        .font(.headline)
                    Text(formatFileSize(transfer.fileSize))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                if transfer.status == .inProgress {
                    Button(action: pauseTransfer) {
                        Image(systemName: "pause.circle.fill")
                    }
                    Button(action: cancelTransfer) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.red)
                    }
                }
            }
            
            ProgressView(value: progress)
                .progressViewStyle(LinearProgressViewStyle())
            
            HStack {
                Text(transfer.status.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Spacer()
                
                Text("\(Int(progress * 100))%")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(8)
        .onAppear {
            updateProgress()
        }
    }
    
    private func updateProgress() {
        // Update progress from transfer manager
        progress = Double(transfer.transferredBytes) / Double(transfer.fileSize)
    }
    
    private func pauseTransfer() {
        // Pause the transfer
    }
    
    private func cancelTransfer() {
        // Cancel the transfer
    }
    
    private func formatFileSize(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

struct FileTransfer {
    let id: String
    let fileName: String
    let fileSize: Int64
    let transferredBytes: Int64
    let status: TransferStatus
    
    enum TransferStatus {
        case pending
        case inProgress
        case paused
        case completed
        case failed
        
        var description: String {
            switch self {
            case .pending: return "Waiting..."
            case .inProgress: return "Transferring..."
            case .paused: return "Paused"
            case .completed: return "Completed"
            case .failed: return "Failed"
            }
        }
    }
}
