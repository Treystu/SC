/**
 * QR Code pairing utilities
 * Provides functions for generating and scanning QR codes for peer pairing
 */

export interface QRPairingData {
  type: 'peer-invite' | 'direct-connect';
  peerId: string;
  publicKey: string;
  timestamp: number;
  name?: string;
  signaling?: string;
}

// Type for jsqr library function signature
type JsQRFunction = (data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: string }) => { data: string } | null;

// Global jsqr reference - must be set before using scan functions
let jsQRInstance: JsQRFunction | null = null;

/**
 * Set the jsqr library instance for QR code scanning
 * This must be called before using scanQRFromVideo or scanQRFromImage
 * @param jsqr - The jsqr default export function
 */
export function setJsQR(jsqr: JsQRFunction): void {
  jsQRInstance = jsqr;
}

/**
 * Check if jsqr is available for scanning
 */
export function isJsQRAvailable(): boolean {
  return jsQRInstance !== null;
}

/**
 * Encode pairing data to a string for QR code
 */
export function encodePairingData(data: QRPairingData): string {
  return JSON.stringify(data);
}

/**
 * Decode pairing data from a QR code string
 */
export function decodePairingData(text: string): QRPairingData | null {
  try {
    const data = JSON.parse(text);
    
    // Validate required fields
    if (!data.type || !data.peerId || !data.publicKey || !data.timestamp) {
      return null;
    }

    // Validate type
    if (data.type !== 'peer-invite' && data.type !== 'direct-connect') {
      return null;
    }

    return data as QRPairingData;
  } catch {
    return null;
  }
}

/**
 * Render a QR code to a canvas element
 * @param canvas - Canvas element to render to
 * @param text - Text to encode in QR code
 * @param options - QR code options
 */
export async function renderQR(
  canvas: HTMLCanvasElement,
  text: string,
  options: {
    size?: number;
    errorCorrection?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  } = {}
): Promise<void> {
  const {
    size = 256,
    errorCorrection = 'M',
    margin = 2,
    darkColor = '#000000',
    lightColor = '#FFFFFF'
  } = options;

  // Dynamic import of qrcode library
  const QRCode = await import('qrcode');
  
  await QRCode.toCanvas(canvas, text, {
    width: size,
    errorCorrectionLevel: errorCorrection,
    margin,
    color: {
      dark: darkColor,
      light: lightColor
    }
  });
}

/**
 * Generate a QR code as a data URL
 * @param text - Text to encode in QR code
 * @param options - QR code options
 * @returns Data URL of the QR code image
 */
export async function generateQRDataURL(
  text: string,
  options: {
    size?: number;
    errorCorrection?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    darkColor?: string;
    lightColor?: string;
  } = {}
): Promise<string> {
  const {
    size = 256,
    errorCorrection = 'M',
    margin = 2,
    darkColor = '#000000',
    lightColor = '#FFFFFF'
  } = options;

  const QRCode = await import('qrcode');
  
  return QRCode.toDataURL(text, {
    width: size,
    errorCorrectionLevel: errorCorrection,
    margin,
    color: {
      dark: darkColor,
      light: lightColor
    }
  });
}

/**
 * Scan QR code from video stream
 * @param video - Video element with camera stream
 * @param signal - AbortSignal to stop scanning
 * @returns Decoded QR code text or null if aborted
 * @note Requires setJsQR to be called first with the jsqr library
 */
export async function scanQRFromVideo(
  video: HTMLVideoElement,
  signal?: AbortSignal
): Promise<string | null> {
  if (!jsQRInstance) {
    throw new Error('jsqr library not initialized. Call setJsQR() first, or install jsqr: npm install jsqr');
  }
  
  const jsQR = jsQRInstance;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Unable to get canvas context');
  }

  return new Promise((resolve) => {
    let animationId: number;

    const scan = () => {
      if (signal?.aborted) {
        resolve(null);
        return;
      }

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code) {
          resolve(code.data);
          return;
        }
      }

      animationId = requestAnimationFrame(scan);
    };

    signal?.addEventListener('abort', () => {
      cancelAnimationFrame(animationId);
      resolve(null);
    });

    scan();
  });
}

/**
 * Scan QR code from an image file
 * @param imageFile - Image file to scan
 * @returns Decoded QR code text or null if not found
 * @note Requires setJsQR to be called first with the jsqr library
 */
export async function scanQRFromImage(imageFile: File): Promise<string | null> {
  if (!jsQRInstance) {
    throw new Error('jsqr library not initialized. Call setJsQR() first, or install jsqr: npm install jsqr');
  }
  
  const jsQR = jsQRInstance;
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          reject(new Error('Unable to get canvas context'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });

        resolve(code ? code.data : null);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = reader.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(imageFile);
  });
}

/**
 * Request camera access and create video stream
 * @returns Object with video element and cleanup function
 */
export async function startCameraStream(): Promise<{
  video: HTMLVideoElement;
  stream: MediaStream;
  stop: () => void;
}> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.playsInline = true;
  await video.play();

  return {
    video,
    stream,
    stop: () => {
      stream.getTracks().forEach(track => track.stop());
    }
  };
}

/**
 * Check if camera access is available
 */
export async function isCameraAvailable(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    return false;
  }
}
