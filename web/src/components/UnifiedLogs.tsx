import React, { useEffect, useState, useRef } from 'react';
import { getInAppLogs, clearInAppLogs, LogEntry, LogLevel } from '../utils/unifiedLogger';

interface UnifiedLogsProps {
  maxHeight?: number;
  showControls?: boolean;
  sourceFilter?: string;
}

export function UnifiedLogs({ maxHeight = 300, showControls = true, sourceFilter }: UnifiedLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial load
    setLogs(getInAppLogs());

    // Subscribe to new logs
    let cleanup: (() => void) | undefined;
    import('../utils/unifiedLogger').then(({ subscribeToLogs }) => {
      cleanup = subscribeToLogs((entry) => {
        if (!isPaused) {
          setLogs(prev => {
            const updated = [entry, ...prev];
            return updated.slice(0, 100);
          });
        }
      });
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  const filteredLogs = logs.filter(log => {
    if (filter !== 'ALL' && log.level !== filter) return false;
    if (sourceFilter && !log.source.includes(sourceFilter)) return false;
    return true;
  });

  const getLevelColor = (level: LogLevel): string => {
    switch (level) {
      case 'DEBUG': return '#6b7280';
      case 'INFO': return '#10b981';
      case 'WARN': return '#f59e0b';
      case 'ERROR': return '#ef4444';
    }
  };

  return (
    <div style={{
      fontFamily: 'monospace',
      fontSize: '11px',
      background: '#1e1e1e',
      color: '#d4d4d4',
      border: '1px solid #333',
      borderRadius: '6px',
      overflow: 'hidden',
      maxHeight: maxHeight ? `${maxHeight}px` : 'none',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: '#2d2d2d',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <span style={{ fontWeight: 600, color: '#fff' }}>📋 Unified Logs</span>
        
        {showControls && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value as LogLevel | 'ALL')}
              style={{
                background: '#3d3d3d',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
              }}
            >
              <option value="ALL">All Levels</option>
              <option value="DEBUG">DEBUG</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="ERROR">ERROR</option>
            </select>

            <button
              onClick={() => setIsPaused(!isPaused)}
              style={{
                background: isPaused ? '#10b981' : '#f59e0b',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>

            <button
              onClick={() => {
                clearInAppLogs();
                setLogs([]);
              }}
              style={{
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Log Entries */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '8px',
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
            No logs to display
          </div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div 
              key={`${log.timestamp}-${idx}`}
              style={{
                padding: '2px 0',
                borderBottom: '1px solid #2a2a2a',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '8px',
                alignItems: 'start',
              }}
            >
              <div style={{ 
                color: '#666', 
                whiteSpace: 'nowrap',
                fontSize: '10px',
              }}>
                {log.timestamp.split('T')[1].split('.')[0]}
                <span style={{ 
                  color: getLevelColor(log.level),
                  marginLeft: '8px',
                  fontWeight: 600,
                }}>
                  [{log.level}]
                </span>
              </div>

              <div>
                <span style={{ 
                  color: '#60a5fa', 
                  fontWeight: 600,
                }}>
                  [{log.source}]
                </span>{' '}
                <span style={{ color: '#d4d4d4' }}>
                  {log.message}
                </span>
                {log.data && (
                  <pre style={{ 
                    margin: '4px 0 0 0', 
                    color: '#9ca3af',
                    fontSize: '10px',
                    overflow: 'auto',
                    maxHeight: '60px',
                  }}>
                    {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : log.data}
                  </pre>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// Mini log indicator for header/footer
interface LogIndicatorProps {
  onClick?: () => void;
}

export function LogIndicator({ onClick }: LogIndicatorProps) {
  const [recentCount, setRecentCount] = useState(0);

  useEffect(() => {
    let count = 0;
    let cleanup: (() => void) | undefined;
    import('../utils/unifiedLogger').then(({ subscribeToLogs }) => {
      cleanup = subscribeToLogs(() => {
        count++;
        setRecentCount(c => Math.min(c + 1, 99));
        setTimeout(() => setRecentCount(c => Math.max(0, c - 1)), 2000);
      });
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  return (
    <button
      onClick={onClick}
      style={{
        background: '#2d2d2d',
        border: '1px solid #444',
        borderRadius: '4px',
        padding: '4px 8px',
        color: '#fff',
        fontSize: '11px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      📋 Logs
      {recentCount > 0 && (
        <span style={{
          background: '#10b981',
          color: '#fff',
          borderRadius: '50%',
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 600,
        }}>
          {recentCount}
        </span>
      )}
    </button>
  );
}

export default UnifiedLogs;
