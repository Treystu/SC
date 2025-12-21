import { useState, useRef } from 'react';

export interface FileAttachmentProps {
  onFileSelected: (file: File) => void;
  onCancel: () => void;
}

export function FileAttachment({ onFileSelected, onCancel }: FileAttachmentProps) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onFileSelected(e.target.files[0]);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="file-attachment-dialog">
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog file-dialog" onClick={(e) => e.stopPropagation()}>
          <h3>Attach File</h3>
          
          <div
            className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={handleButtonClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleChange}
              style={{ display: 'none' }}
            />
            <div className="drop-zone-content">
              <div className="upload-icon">📁</div>
              <p>Drag and drop a file here</p>
              <p className="secondary">or click to browse</p>
              <p className="file-limit">Max size: 100MB</p>
            </div>
          </div>

          <div className="dialog-actions">
            <button onClick={onCancel} className="btn btn-secondary cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
