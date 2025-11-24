/**
 * File Upload Progress Component
 * Task 142: File upload with progress tracking
 */

import React, { useState, useRef } from 'react';

interface FileUploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  speed?: number; // bytes per second
  remainingTime?: number; // seconds
}

interface FileUploadProgressProps {
  onFilesSelected: (files: File[]) => void;
  maxFileSize?: number; // bytes
  allowedTypes?: string[];
  maxFiles?: number;
}

export const FileUploadProgress: React.FC<FileUploadProgressProps> = ({
  onFilesSelected,
  maxFileSize = 100 * 1024 * 1024, // 100 MB default
  allowedTypes = [],
  maxFiles = 10
}) => {
  const [uploads, setUploads] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files);
    
    // Validate files
    const validFiles = fileArray.filter(file => {
      // Check file size
      if (file.size > maxFileSize) {
        alert(`File ${file.name} is too large. Max size: ${formatBytes(maxFileSize)}`);
        return false;
      }
      
      // Check file type
      if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        alert(`File ${file.name} has unsupported type.`);
        return false;
      }
      
      return true;
    });
    
    // Check max files
    if (uploads.length + validFiles.length > maxFiles) {
      alert(`Maximum ${maxFiles} files allowed.`);
      return;
    }
    
    // Create upload items
    const newUploads: FileUploadItem[] = validFiles.map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file,
      progress: 0,
      status: 'pending'
    }));
    
    setUploads(prev => [...prev, ...newUploads]);
    
    // Notify parent
    onFilesSelected(validFiles);
    
    // Start uploads
    newUploads.forEach(upload => simulateUpload(upload));
  };
  
  const simulateUpload = (upload: FileUploadItem) => {
    const startTime = Date.now();
    const totalSize = upload.file.size;
    let uploadedBytes = 0;
    
    const updateProgress = () => {
      uploadedBytes += totalSize / 100; // Simulate progress
      const progress = Math.min((uploadedBytes / totalSize) * 100, 100);
      const elapsedTime = (Date.now() - startTime) / 1000; // seconds
      const speed = uploadedBytes / elapsedTime;
      const remainingBytes = totalSize - uploadedBytes;
      const remainingTime = remainingBytes / speed;
      
      setUploads(prev => prev.map(u => 
        u.id === upload.id 
          ? { ...u, progress, status: 'uploading', speed, remainingTime }
          : u
      ));
      
      if (progress < 100) {
        setTimeout(updateProgress, 100);
      } else {
        setUploads(prev => prev.map(u => 
          u.id === upload.id 
            ? { ...u, progress: 100, status: 'complete' }
            : u
        ));
      }
    };
    
    updateProgress();
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };
  
  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };
  
  const clearCompleted = () => {
    setUploads(prev => prev.filter(u => u.status !== 'complete'));
  };
  
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '--';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };
  
  return (
    <div className="file-upload-progress">
      <div 
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-zone-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p>Drag and drop files here or click to browse</p>
          <p className="hint">Max file size: {formatBytes(maxFileSize)}</p>
        </div>
        <input 
          ref={fileInputRef}
          type="file" 
          multiple 
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: 'none' }}
          accept={allowedTypes.join(',')}
        />
      </div>
      
      {uploads.length > 0 && (
        <div className="upload-list">
          <div className="upload-header">
            <h3>Uploads ({uploads.length})</h3>
            {uploads.some(u => u.status === 'complete') && (
              <button onClick={clearCompleted} className="clear-btn">
                Clear Completed
              </button>
            )}
          </div>
          
          {uploads.map(upload => (
            <div key={upload.id} className={`upload-item ${upload.status}`}>
              <div className="upload-info">
                <div className="file-icon">📄</div>
                <div className="file-details">
                  <div className="file-name">{upload.file.name}</div>
                  <div className="file-meta">
                    {formatBytes(upload.file.size)}
                    {upload.speed && ` • ${formatBytes(upload.speed)}/s`}
                    {upload.remainingTime && ` • ${formatTime(upload.remainingTime)} remaining`}
                  </div>
                </div>
                <button 
                  onClick={() => removeUpload(upload.id)}
                  className="remove-btn"
                >
                  ✕
                </button>
              </div>
              
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
              
              <div className="upload-status">
                {upload.status === 'uploading' && `${Math.round(upload.progress)}%`}
                {upload.status === 'complete' && '✓ Complete'}
                {upload.status === 'error' && `✗ ${upload.error || 'Failed'}`}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <style>{`
        .file-upload-progress {
          padding: 20px;
        }
        
        .drop-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .drop-zone:hover, .drop-zone.dragging {
          border-color: #007bff;
          background-color: #f0f8ff;
        }
        
        .drop-zone-content svg {
          color: #666;
          margin-bottom: 16px;
        }
        
        .drop-zone-content p {
          margin: 8px 0;
          color: #333;
        }
        
        .drop-zone-content .hint {
          font-size: 12px;
          color: #666;
        }
        
        .upload-list {
          margin-top: 20px;
        }
        
        .upload-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .upload-header h3 {
          margin: 0;
          font-size: 18px;
        }
        
        .clear-btn {
          padding: 6px 12px;
          background-color: #f0f0f0;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        
        .clear-btn:hover {
          background-color: #e0e0e0;
        }
        
        .upload-item {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          background-color: white;
        }
        
        .upload-item.complete {
          border-color: #28a745;
          background-color: #f0fff4;
        }
        
        .upload-item.error {
          border-color: #dc3545;
          background-color: #fff0f0;
        }
        
        .upload-info {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .file-icon {
          font-size: 32px;
        }
        
        .file-details {
          flex: 1;
        }
        
        .file-name {
          font-weight: 500;
          margin-bottom: 4px;
        }
        
        .file-meta {
          font-size: 12px;
          color: #666;
        }
        
        .remove-btn {
          width: 24px;
          height: 24px;
          border: none;
          background-color: #f0f0f0;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .remove-btn:hover {
          background-color: #dc3545;
          color: white;
        }
        
        .progress-bar {
          height: 6px;
          background-color: #e0e0e0;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        
        .progress-fill {
          height: 100%;
          background-color: #007bff;
          transition: width 0.3s;
        }
        
        .upload-item.complete .progress-fill {
          background-color: #28a745;
        }
        
        .upload-item.error .progress-fill {
          background-color: #dc3545;
        }
        
        .upload-status {
          font-size: 12px;
          text-align: right;
          color: #666;
        }
        
        .upload-item.complete .upload-status {
          color: #28a745;
          font-weight: 500;
        }
        
        .upload-item.error .upload-status {
          color: #dc3545;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};
