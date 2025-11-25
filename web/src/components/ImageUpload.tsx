import { useState, useRef } from 'react';

export interface ImageUploadProps {
  onImageSelected: (file: File) => void;
  onCancel: () => void;
}

export function ImageUpload({ onImageSelected, onCancel }: ImageUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

    if (e.dataTransfer.files && e.dataTransfer.files) {
      handleFile(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files) {
      handleFile(e.target.files);
    }
  };

  const handleFile = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      onImageSelected(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      alert('Please select an image file.');
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="image-upload-dialog">
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog image-dialog" onClick={(e) => e.stopPropagation()}>
          <h3>Upload Image</h3>

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
              accept="image/*"
              onChange={handleChange}
              style={{ display: 'none' }}
            />
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="image-preview" />
            ) : (
              <div className="drop-zone-content">
                <div className="upload-icon">🖼️</div>
                <p>Drag and drop an image here</p>
                <p className="secondary">or click to browse</p>
              </div>
            )}
          </div>

          <div className="dialog-actions">
            <button onClick={onCancel} className="cancel-btn">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}