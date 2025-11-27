export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedName?: string;
}

export const FILE_LIMITS = {
  MAX_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_FILES_PER_MESSAGE: 10,
  ALLOWED_TYPES: [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Videos
    'video/mp4',
    'video/webm',
    'video/quicktime',
    // Audio
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    // Documents
    'application/pdf',
    'text/plain',
    // Archives
    'application/zip',
    'application/x-7z-compressed'
  ],
  BLOCKED_EXTENSIONS: [
    '.exe', '.bat', '.cmd', '.com', '.pif', '.scr',
    '.vbs', '.js', '.jar', '.app', '.deb', '.rpm'
  ]
};

export function validateFile(file: File): FileValidationResult {
  // Check file size
  if (file.size > FILE_LIMITS.MAX_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${FILE_LIMITS.MAX_SIZE / 1024 / 1024}MB`
    };
  }
  
  // Check file type
  if (!FILE_LIMITS.ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed: ${file.type}`
    };
  }
  
  // Check file extension
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (FILE_LIMITS.BLOCKED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `File extension not allowed: ${extension}`
    };
  }
  
  // Sanitize filename
  const sanitizedName = sanitizeFilename(file.name);
  
  return {
    valid: true,
    sanitizedName
  };
}

export function validateFileList(files: FileList | File[]): FileValidationResult {
  if (files.length > FILE_LIMITS.MAX_FILES_PER_MESSAGE) {
    return {
      valid: false,
      error: `Too many files. Maximum is ${FILE_LIMITS.MAX_FILES_PER_MESSAGE} files per message`
    };
  }
  
  for (const file of Array.from(files)) {
    const result = validateFile(file);
    if (!result.valid) {
      return result;
    }
  }
  
  return { valid: true };
}

function sanitizeFilename(filename: string): string {
  // Remove path traversal attempts
  let sanitized = filename.replace(/\.\./g, '');
  
  // Remove special characters except dots, dashes, underscores
  sanitized = sanitized.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = sanitized.split('.').pop();
    sanitized = sanitized.substring(0, 250) + '.' + ext;
  }
  
  return sanitized;
}