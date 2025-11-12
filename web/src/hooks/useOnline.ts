import { useState, useEffect } from 'react';

/**
 * Hook that tracks online/offline status
 * @returns Boolean indicating if browser is online
 */
export function useOnline(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook that provides detailed network information
 * @returns Network connection details
 */
export function useNetworkStatus() {
  const isOnline = useOnline();
  const [effectiveType, setEffectiveType] = useState<string>('unknown');
  const [downlink, setDownlink] = useState<number>(0);
  const [rtt, setRtt] = useState<number>(0);

  useEffect(() => {
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;

    if (connection) {
      const updateConnectionInfo = () => {
        setEffectiveType(connection.effectiveType || 'unknown');
        setDownlink(connection.downlink || 0);
        setRtt(connection.rtt || 0);
      };

      updateConnectionInfo();
      connection.addEventListener('change', updateConnectionInfo);

      return () => {
        connection.removeEventListener('change', updateConnectionInfo);
      };
    }
  }, []);

  return {
    isOnline,
    effectiveType,
    downlink,
    rtt,
  };
}
