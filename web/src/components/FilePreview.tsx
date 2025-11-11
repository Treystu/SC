import React, { useState, useEffect } from 'react';

interface FilePreviewProps {
  file: File | { name: string; type: string; url: string; size: number };
  onClose: () => void;
  onDownload?: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, onClose, onDownload }) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewType, setPreviewType] = useState<'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unknown'>('unknown');
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    determinePreviewType();
    generatePreview();

    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [file]);

  const determinePreviewType = () => {
    const type = file.type.toLowerCase();
    
    if (type.startsWith('image/')) {
      setPreviewType('image');
    } else if (type.startsWith('video/')) {
      setPreviewType('video');
    } else if (type.startsWith('audio/')) {
      setPreviewType('audio');
    } else if (type === 'application/pdf') {
      setPreviewType('pdf');
    } else if (type.startsWith('text/') || type === 'application/json') {
      setPreviewType('text');
    } else {
      setPreviewType('unknown');
    }
  };

  const generatePreview = async () => {
    try {
      setLoading(true);
      setError('');

      if ('url' in file) {
        setPreviewUrl(file.url);
        setLoading(false);
        return;
      }

      const url = URL.createObjectURL(file as File);
      setPreviewUrl(url);

      if (previewType === 'text') {
        const text = await (file as File).text();
        setTextContent(text);
      }

      setLoading(false);
    } catch (err) {
      setError('Failed to load preview');
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderPreview = () => {
    if (loading) {
      return (
        <div className="preview-loading" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <div className="spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' }} />
        </div>
      );
    }

    if (error) {
      return (
        <div className="preview-error" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#f44336', fontSize: '18px' }}>
          {error}
        </div>
      );
    }

    switch (previewType) {
      case 'image':
        return (
          <img
            src={previewUrl}
            alt={file.name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        );

      case 'video':
        return (
          <video
            src={previewUrl}
            controls
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          >
            Your browser does not support video playback.
          </video>
        );

      case 'audio':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>🎵</div>
            <audio src={previewUrl} controls style={{ width: '80%', maxWidth: '500px' }}>
              Your browser does not support audio playback.
            </audio>
          </div>
        );

      case 'pdf':
        return (
          <iframe
            src={previewUrl}
            title={file.name}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        );

      case 'text':
        return (
          <div className="text-preview" style={{ padding: '24px', overflow: 'auto', height: '100%' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'monospace', fontSize: '14px' }}>
              {textContent}
            </pre>
          </div>
        );

      default:
        return (
          <div className="preview-unsupported" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>📄</div>
            <p style={{ fontSize: '18px', color: '#666' }}>Preview not available for this file type</p>
            <p style={{ fontSize: '14px', color: '#999' }}>Click download to view the file</p>
          </div>
        );
    }
  };

  return (
    <div className="file-preview-modal" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="preview-header" style={{ padding: '16px', backgroundColor: '#2a2a2a', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="file-info">
          <h3 style={{ margin: 0, fontSize: '18px' }}>{file.name}</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#aaa' }}>
            {file.type} • {formatFileSize(file.size)}
          </p>
        </div>
        <div className="preview-actions" style={{ display: 'flex', gap: '12px' }}>
          {onDownload && (
            <button
              onClick={onDownload}
              style={{ padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            >
              📥 Download
            </button>
          )}
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
          >
            ✕ Close
            </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="preview-content" style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px' }}>
        {renderPreview()}
      </div>

      {/* Footer */}
      <div className="preview-footer" style={{ padding: '12px', backgroundColor: '#2a2a2a', color: '#aaa', fontSize: '12px', textAlign: 'center' }}>
        Press ESC to close
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Hook for keyboard shortcuts
export const useFilePreview = () => {
  const [previewFile, setPreviewFile] = useState<File | { name: string; type: string; url: string; size: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewFile) {
        setPreviewFile(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewFile]);

  return {
    previewFile,
    openPreview: setPreviewFile,
    closePreview: () => setPreviewFile(null),
  };
};
