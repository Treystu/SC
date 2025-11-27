import React from 'react';
import { ConnectionQuality } from '../../core/src/connection-quality';

interface ConnectionStatusProps {
  quality: ConnectionQuality;
}

const qualityConfig: Record<ConnectionQuality, { color: string; label: string }> = {
  excellent: { color: 'bg-green-500', label: 'Excellent' },
  good: { color: 'bg-yellow-500', label: 'Good' },
  fair: { color: 'bg-orange-500', label: 'Fair' },
  poor: { color: 'bg-red-500', label: 'Poor' },
  offline: { color: 'bg-gray-500', label: 'Offline' },
};

export function ConnectionStatus({ quality }: ConnectionStatusProps) {
  const { color, label } = qualityConfig[quality];

  return (
    <div className="flex items-center space-x-2" title={`Connection: ${label}`}>
      <div className={`w-3 h-3 rounded-full ${color}`}></div>
      <span className="text-sm text-gray-600 sr-only">{label}</span>
    </div>
  );
}