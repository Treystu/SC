export enum ReceiptStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

interface ReadReceiptsProps {
  status: ReceiptStatus;
  timestamp: number;
}

export function ReadReceipts({ status, timestamp }: ReadReceiptsProps) {
  const getIcon = () => {
    switch (status) {
      case ReceiptStatus.SENT:
        return '✓';
      case ReceiptStatus.DELIVERED:
        return '✓✓';
      case ReceiptStatus.READ:
        return '✓✓';
      case ReceiptStatus.FAILED:
        return '⚠';
      default:
        return '';
    }
  };

  const getColor = () => {
    switch (status) {
      case ReceiptStatus.READ:
        return '#10b981';
      case ReceiptStatus.DELIVERED:
        return '#6b7280';
      case ReceiptStatus.SENT:
        return '#9ca3af';
      case ReceiptStatus.FAILED:
        return '#ef4444';
      default:
        return '#9ca3af';
    }
  };

  return (
    <span
      className="read-receipts"
      style={{ color: getColor() }}
      title={new Date(timestamp).toLocaleString()}
    >
      {getIcon()}
    </span>
  );
}
