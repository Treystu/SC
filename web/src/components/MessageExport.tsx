import React, { useState } from 'react';

interface Message {
  id: string;
  content: string;
  timestamp: number;
  senderId: string;
  senderName?: string;
  type: 'text' | 'file' | 'voice';
}

interface ExportOptions {
  format: 'json' | 'csv' | 'txt' | 'html';
  includeMetadata: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export const MessageExport: React.FC<{
  messages: Message[];
  conversationName?: string;
}> = ({ messages, conversationName = 'conversation' }) => {
  const [format, setFormat] = useState<'json' | 'csv' | 'txt' | 'html'>('json');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [showDateRange, setShowDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filterByDateRange = (msgs: Message[]): Message[] => {
    if (!showDateRange || !startDate || !endDate) return msgs;
    
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    
    return msgs.filter(m => m.timestamp >= start && m.timestamp <= end);
  };

  const exportAsJSON = (msgs: Message[]): string => {
    const data = includeMetadata
      ? {
          conversation: conversationName,
          exportDate: new Date().toISOString(),
          messageCount: msgs.length,
          messages: msgs,
        }
      : msgs;
    
    return JSON.stringify(data, null, 2);
  };

  const exportAsCSV = (msgs: Message[]): string => {
    const headers = includeMetadata
      ? 'Timestamp,Sender ID,Sender Name,Type,Content\n'
      : 'Timestamp,Content\n';
    
    const rows = msgs.map(m => {
      const timestamp = new Date(m.timestamp).toISOString();
      const content = m.content.replace(/"/g, '""'); // Escape quotes
      
      return includeMetadata
        ? `"${timestamp}","${m.senderId}","${m.senderName || 'Unknown'}","${m.type}","${content}"`
        : `"${timestamp}","${content}"`;
    }).join('\n');
    
    return headers + rows;
  };

  const exportAsTXT = (msgs: Message[]): string => {
    let output = '';
    
    if (includeMetadata) {
      output += `Conversation: ${conversationName}\n`;
      output += `Export Date: ${new Date().toISOString()}\n`;
      output += `Message Count: ${msgs.length}\n`;
      output += `${'='.repeat(50)}\n\n`;
    }
    
    msgs.forEach(m => {
      const timestamp = new Date(m.timestamp).toLocaleString();
      const sender = m.senderName || m.senderId;
      
      if (includeMetadata) {
        output += `[${timestamp}] ${sender}:\n${m.content}\n\n`;
      } else {
        output += `${m.content}\n`;
      }
    });
    
    return output;
  };

  const exportAsHTML = (msgs: Message[]): string => {
    const metadata = includeMetadata
      ? `
        <div class="metadata">
          <h2>${conversationName}</h2>
          <p>Exported: ${new Date().toLocaleString()}</p>
          <p>Messages: ${msgs.length}</p>
        </div>
      `
      : '';
    
    const messageHTML = msgs.map(m => {
      const timestamp = new Date(m.timestamp).toLocaleString();
      const sender = m.senderName || m.senderId;
      
      return `
        <div class="message">
          ${includeMetadata ? `<div class="meta"><strong>${sender}</strong> - ${timestamp}</div>` : ''}
          <div class="content">${m.content}</div>
        </div>
      `;
    }).join('');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${conversationName} - Export</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .metadata { background: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .message { margin-bottom: 15px; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 5px; }
          .meta { color: #666; font-size: 0.9em; margin-bottom: 5px; }
          .content { line-height: 1.6; }
        </style>
      </head>
      <body>
        ${metadata}
        <div class="messages">${messageHTML}</div>
      </body>
      </html>
    `;
  };

  const handleExport = () => {
    const filteredMessages = filterByDateRange(messages);
    
    if (filteredMessages.length === 0) {
      alert('No messages to export');
      return;
    }
    
    let content = '';
    let mimeType = 'text/plain';
    let extension = 'txt';
    
    switch (format) {
      case 'json':
        content = exportAsJSON(filteredMessages);
        mimeType = 'application/json';
        extension = 'json';
        break;
      case 'csv':
        content = exportAsCSV(filteredMessages);
        mimeType = 'text/csv';
        extension = 'csv';
        break;
      case 'txt':
        content = exportAsTXT(filteredMessages);
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'html':
        content = exportAsHTML(filteredMessages);
        mimeType = 'text/html';
        extension = 'html';
        break;
    }
    
    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conversationName}_${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="message-export">
      <h3>Export Messages</h3>
      
      <div className="export-options">
        <label>
          Format:
          <select value={format} onChange={(e) => setFormat(e.target.value as any)}>
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="txt">Plain Text</option>
            <option value="html">HTML</option>
          </select>
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={includeMetadata}
            onChange={(e) => setIncludeMetadata(e.target.checked)}
          />
          Include metadata (sender, timestamp, type)
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={showDateRange}
            onChange={(e) => setShowDateRange(e.target.checked)}
          />
          Filter by date range
        </label>
        
        {showDateRange && (
          <div className="date-range">
            <label>
              Start:
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              End:
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>
      
      <button onClick={handleExport} className="export-btn">
        Export {filterByDateRange(messages).length} Messages as {format.toUpperCase()}
      </button>
      
      <style>{`
        .message-export {
          padding: 1rem;
          background: #1a1a1a;
          border-radius: 8px;
        }
        
        .export-options {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin: 1rem 0;
        }
        
        .export-options label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .export-options select,
        .export-options input[type="date"] {
          padding: 0.5rem;
          background: #2a2a2a;
          border: 1px solid #333;
          border-radius: 4px;
          color: white;
        }
        
        .date-range {
          display: flex;
          gap: 1rem;
          padding-left: 1.5rem;
        }
        
        .export-btn {
          width: 100%;
          padding: 0.75rem;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          font-weight: bold;
          cursor: pointer;
        }
        
        .export-btn:hover {
          background: #45a049;
        }
      `}</style>
    </div>
  );
};
