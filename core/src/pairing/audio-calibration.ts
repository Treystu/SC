/**
 * Audio tone pairing with calibration and adaptive bitrate
 * Handles device pairing via audio tones with environment calibration
 */

export interface AudioCalibrationResult {
  bitDuration: number;
  noiseLevel: number;
  signalStrength: number;
  quality: 'excellent' | 'good' | 'poor' | 'unusable';
}

export interface AudioPairingConfig {
  baseFrequency: number;
  spacing: number;
  minBitDuration: number;
  maxBitDuration: number;
  calibrationDuration: number;
}

const DEFAULT_CONFIG: AudioPairingConfig = {
  baseFrequency: 440,      // Hz
  spacing: 100,            // Hz between tones
  minBitDuration: 50,      // ms
  maxBitDuration: 200,     // ms
  calibrationDuration: 2000 // ms
};

/**
 * Audio calibration utility for adaptive bitrate pairing
 */
export class AudioCalibration {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private config: AudioPairingConfig;

  constructor(config: Partial<AudioPairingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize audio context
   */
  private async initAudio(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Calibrate bit duration based on environment
   * @param signal - AbortSignal to cancel calibration
   * @returns Calibration result with optimal bit duration
   */
  async calibrateBitDuration(signal?: AbortSignal): Promise<AudioCalibrationResult> {
    await this.initAudio();

    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    // Request microphone access for calibration
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Measure ambient noise
      const measurements: number[] = [];
      const startTime = Date.now();

      while (Date.now() - startTime < this.config.calibrationDuration) {
        if (signal?.aborted) {
          throw new Error('Calibration aborted');
        }

        this.analyser.getByteFrequencyData(dataArray);
        const avgLevel = dataArray.reduce((a, b) => a + b) / bufferLength;
        measurements.push(avgLevel);

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Calculate noise statistics
      const noiseLevel = measurements.reduce((a, b) => a + b) / measurements.length;
      const maxLevel = Math.max(...measurements);
      const variance = measurements.reduce((sum, val) => sum + Math.pow(val - noiseLevel, 2), 0) / measurements.length;

      // Determine optimal bit duration based on noise
      let bitDuration: number;
      let quality: AudioCalibrationResult['quality'];

      if (noiseLevel < 10 && variance < 5) {
        bitDuration = this.config.minBitDuration;
        quality = 'excellent';
      } else if (noiseLevel < 25 && variance < 15) {
        bitDuration = this.config.minBitDuration + 25;
        quality = 'good';
      } else if (noiseLevel < 50 && variance < 30) {
        bitDuration = this.config.minBitDuration + 75;
        quality = 'poor';
      } else {
        bitDuration = this.config.maxBitDuration;
        quality = 'unusable';
      }

      return {
        bitDuration,
        noiseLevel,
        signalStrength: maxLevel - noiseLevel,
        quality
      };
    } finally {
      // Stop microphone stream
      stream.getTracks().forEach(track => track.stop());
    }
  }

  /**
   * Play audio data using FSK modulation
   * @param text - Text to encode
   * @param bitDuration - Duration of each bit in milliseconds
   */
  async playAudioData(text: string, bitDuration: number): Promise<void> {
    await this.initAudio();

    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    // Convert text to binary
    const binary = textToBinary(text);
    const sampleRate = this.audioContext.sampleRate;
    const samplesPerBit = Math.floor((bitDuration / 1000) * sampleRate);
    
    // Create audio buffer
    const bufferLength = binary.length * samplesPerBit;
    const buffer = this.audioContext.createBuffer(1, bufferLength, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Generate FSK tones
    let offset = 0;
    for (const bit of binary) {
      const frequency = bit === '1' 
        ? this.config.baseFrequency + this.config.spacing 
        : this.config.baseFrequency;
      
      for (let i = 0; i < samplesPerBit; i++) {
        const t = i / sampleRate;
        channelData[offset + i] = 0.5 * Math.sin(2 * Math.PI * frequency * t);
      }
      offset += samplesPerBit;
    }

    // Apply envelope to reduce clicks
    applyEnvelope(channelData, samplesPerBit);

    // Play the audio
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();

    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  }

  /**
   * Receive audio data via FSK demodulation
   * @param stream - Media stream from microphone
   * @param bitDuration - Expected bit duration in milliseconds
   * @param expectedLength - Expected number of characters
   * @param signal - AbortSignal to cancel reception
   * @returns Decoded text
   */
  async receiveAudioData(
    stream: MediaStream,
    bitDuration: number,
    expectedLength: number,
    signal?: AbortSignal
  ): Promise<string> {
    await this.initAudio();

    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const expectedBits = expectedLength * 8;
    const bits: string[] = [];

    // Calculate frequency bins
    const binWidth = this.audioContext.sampleRate / this.analyser.fftSize;
    const lowBin = Math.round(this.config.baseFrequency / binWidth);
    const highBin = Math.round((this.config.baseFrequency + this.config.spacing) / binWidth);

    // Sample at bit rate
    const sampleInterval = bitDuration / 2;
    
    while (bits.length < expectedBits) {
      if (signal?.aborted) {
        throw new Error('Reception aborted');
      }

      this.analyser.getByteFrequencyData(dataArray);
      
      const lowPower = dataArray[lowBin] + dataArray[lowBin - 1] + dataArray[lowBin + 1];
      const highPower = dataArray[highBin] + dataArray[highBin - 1] + dataArray[highBin + 1];

      if (highPower > lowPower * 1.5) {
        bits.push('1');
      } else if (lowPower > 20) {
        bits.push('0');
      }

      await new Promise(resolve => setTimeout(resolve, sampleInterval));
    }

    // Convert binary to text
    return binaryToText(bits.join(''));
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
  }
}

/**
 * Convert text to binary string
 */
function textToBinary(text: string): string {
  return text.split('')
    .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
    .join('');
}

/**
 * Convert binary string to text
 */
function binaryToText(binary: string): string {
  const bytes = binary.match(/.{1,8}/g) || [];
  return bytes
    .map(byte => String.fromCharCode(parseInt(byte, 2)))
    .join('');
}

/**
 * Apply envelope to reduce audio clicks
 */
function applyEnvelope(data: Float32Array, samplesPerBit: number): void {
  const rampSamples = Math.min(50, Math.floor(samplesPerBit * 0.1));
  
  // Apply fade in/out to each bit
  for (let bit = 0; bit < data.length / samplesPerBit; bit++) {
    const offset = bit * samplesPerBit;
    
    // Fade in
    for (let i = 0; i < rampSamples; i++) {
      data[offset + i] *= i / rampSamples;
    }
    
    // Fade out
    for (let i = 0; i < rampSamples; i++) {
      const idx = offset + samplesPerBit - rampSamples + i;
      if (idx < data.length) {
        data[idx] *= 1 - (i / rampSamples);
      }
    }
  }
}

/**
 * Convenience function to calibrate and play data
 */
export async function playAudioData(
  text: string,
  bitDuration?: number
): Promise<void> {
  const calibration = new AudioCalibration();
  try {
    const duration = bitDuration ?? (await calibration.calibrateBitDuration()).bitDuration;
    await calibration.playAudioData(text, duration);
  } finally {
    calibration.cleanup();
  }
}

/**
 * Convenience function to calibrate bit duration
 */
export async function calibrateBitDuration(
  signal?: AbortSignal
): Promise<AudioCalibrationResult> {
  const calibration = new AudioCalibration();
  try {
    return await calibration.calibrateBitDuration(signal);
  } finally {
    calibration.cleanup();
  }
}
