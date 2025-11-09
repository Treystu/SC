import { useState, useEffect } from 'react';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  className?: string;
}

function ConnectionStatus({ className = '' }: ConnectionStatusProps) {
  const [peerCount, setPeerCount] = useState(0);
  const [status, setStatus] = useState<'online' | 'offline' | 'connecting'>('offline');

  useEffect(() => {
    // This will be connected to the actual mesh network
    // For now, show offline status
    setStatus('offline');
    setPeerCount(0);
  }, []);

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
