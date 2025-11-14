/**
 * Advanced file export component with multiple formats
 */
import { useState } from 'react';

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: number;
  type: 'text' | 'file' | 'voice';
}

export const FileExport: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const [format, setFormat] = useState<'json' | 'csv' | 'txt' | 'html'>('json');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });

  const exportToJSON = (msgs: Message[]): string => {
    return JSON.stringify(msgs, null, 2);
  };

  const exportToCSV = (msgs: Message[]): string => {
    const headers = includeMetadata
      ? 'ID,Sender ID,Content,Timestamp,Type\n'
      : 'Sender ID,Content,Timestamp\n';

    const rows = msgs.map(m => {
      const fields = includeMetadata
        ? [m.id, m.senderId, m.content, m.timestamp, m.type]
        : [m.senderId, m.content, m.timestamp];

      return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',');
    }).join('\n');

    return headers + rows;
  };

  const exportToTXT = (msgs: Message[]): string => {
    return msgs.map(m => {
      const date = new Date(m.timestamp).toLocaleString();
      const metadata = includeMetadata ? `[${m.id}] ` : '';
      return `${metadata}${date} - ${m.senderId}: ${m.content}`;
    }).join('\n\n');
  };

  const exportToHTML = (msgs: Message[]): string => {
    const rows = msgs.map(m => {
      const date = new Date(m.timestamp).toLocaleString();
      const metadataCol = includeMetadata
        ? `<td>${m.id}</td><td>${m.type}</td>`
        : '';

      return `
        <tr>
          ${metadataCol}
          <td>${m.senderId}</td>
          <td>${m.content}</td>
          <td>${date}</td>
        </tr>
      `;
    }).join('');

    const metadataHeaders = includeMetadata
      ? '<th>ID</th><th>Type</th>'
      : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sovereign Communications Export</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Message Export</h1>
  <p>Exported: ${new Date().toLocaleString()}</p>
  <p>Total messages: ${msgs.length}</p>
  <table>
    <thead>
      <tr>
        ${metadataHeaders}
        <th>Sender</th>
        <th>Content</th>
        <th>Timestamp</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
    `.trim();
  };

  const handleExport = () => {
    let filtered = messages;

    // Apply date range filter
    if (dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start).getTime();
      const end = new Date(dateRange.end).getTime();
      filtered = messages.filter(m => m.timestamp >= start && m.timestamp <= end);
    }

    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'json':
        content = exportToJSON(filtered);
        mimeType = 'application/json';
        extension = 'json';
        break;
      case 'csv':
        content = exportToCSV(filtered);
        mimeType = 'text/csv';
        extension = 'csv';
        break;
      case 'txt':
        content = exportToTXT(filtered);
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'html':
        content = exportToHTML(filtered);
        mimeType = 'text/html';
        extension = 'html';
        break;
    }

    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `messages_${Date.now()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>Export Messages</h2>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Format:</label>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as any)}
          style={{ width: '100%', padding: '8px' }}
        >
          <option value="json">JSON</option>
          <option value="csv">CSV</option>
          <option value="txt">Plain Text</option>
          <option value="html">HTML</option>
        </select>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>
          <input
            type="checkbox"
            checked={includeMetadata}
            onChange={(e) => setIncludeMetadata(e.target.checked)}
          />
          {' '}Include metadata (ID, type)
        </label>
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Date Range (optional):</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            style={{ flex: 1, padding: '8px' }}
          />
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            style={{ flex: 1, padding: '8px' }}
          />
        </div>
      </div>

      <button
        onClick={handleExport}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px'
        }}
      >
        Export {messages.length} Messages
      </button>

      <div style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
        <strong>Format descriptions:</strong>
        <ul style={{ marginTop: '5px' }}>
          <li><strong>JSON:</strong> Machine-readable format, best for re-importing</li>
          <li><strong>CSV:</strong> Spreadsheet-compatible format</li>
          <li><strong>TXT:</strong> Human-readable plain text</li>
          <li><strong>HTML:</strong> Styled document with table format</li>
        </ul>
      </div>
    </div>
  );
};
