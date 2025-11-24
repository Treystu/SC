import './ConnectionStatus.css';

interface ConnectionStatusProps {
  className?: string;
  status?: 'online' | 'offline' | 'connecting';
  peerCount?: number;
}

function ConnectionStatus({ className = '', status = 'offline', peerCount = 0 }: ConnectionStatusProps) {
  const statusText = {
    online: 'Connected',
    offline: 'Offline',
    connecting: 'Connecting...',
  };

  return (
    <div className={`connection-status ${status} ${className}`}>
      <div className="status-indicator"></div>
      <span className="status-text">{statusText[status]}</span>
      {status === 'online' && (
        <span className="peer-count">{peerCount} peer{peerCount !== 1 ? 's' : ''}</span>
      )}
    </div>
  );
}

export default ConnectionStatus;
