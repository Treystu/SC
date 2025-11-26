/**
 * Audio Tone Pairing (DTMF)
 * Task 51: Implement audio tone pairing for peer discovery
 * 
 * Uses DTMF (Dual-Tone Multi-Frequency) encoding to transmit peer information
 * via audio, allowing pairing without QR codes or manual entry
 */

// DTMF frequency pairs for digits 0-9, *, #
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  '1': [697, 1209],
  '2': [697, 1336],
  '3': [697, 1477],
  '4': [770, 1209],
  '5': [770, 1336],
  '6': [770, 1477],
  '7': [852, 1209],
  '8': [852, 1336],
  '9': [852, 1477],
  '0': [941, 1336],
  '*': [941, 1209],
  '#': [941, 1477],
};

export interface AudioPairingOptions {
  toneDuration: number;  // Duration of each tone in ms
  pauseDuration: number;  // Pause between tones in ms
  sampleRate: number;     // Audio sample rate
}

const DEFAULT_OPTIONS: AudioPairingOptions = {
  toneDuration: 100,
  pauseDuration: 50,
  sampleRate: 44100,
};

export class AudioTonePairing {
  private audioContext: AudioContext | null = null;
  private options: AudioPairingOptions;

  constructor(options: Partial<AudioPairingOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Encode peer ID to DTMF tones
   * Converts hex peer ID to digits that can be transmitted via DTMF
   */
  encodePeerIdToDTMF(peerId: string): string {
    // Take first 16 chars of peer ID (hex) and convert to DTMF-safe format
    const hexChars = peerId.substring(0, 16);

    // Convert hex to decimal digits for DTMF transmission
    let dtmfSequence = '#';  // Start marker

    for (const char of hexChars) {
      const value = parseInt(char, 16);
      dtmfSequence += value.toString();
    }

    dtmfSequence += '#';  // End marker
    return dtmfSequence;
  }

  /**
   * Decode DTMF sequence back to peer ID
   */
  decodeDTMFToPeerId(dtmfSequence: string): string | null {
    if (!dtmfSequence.startsWith('#') || !dtmfSequence.endsWith('#')) {
      return null;  // Invalid format
    }

    const digits = dtmfSequence.slice(1, -1);  // Remove markers

    // Convert decimal digits back to hex
    let peerId = '';
    for (const digit of digits) {
      const hexValue = parseInt(digit).toString(16);
      peerId += hexValue;
    }

    return peerId;
  }

  /**
   * Generate audio tones for DTMF sequence
   */
  async generateTones(dtmfSequence: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    }

    const { toneDuration, pauseDuration, sampleRate } = this.options;
    const toneSamples = Math.floor((toneDuration / 1000) * sampleRate);
    const pauseSamples = Math.floor((pauseDuration / 1000) * sampleRate);
    const totalSamples = dtmfSequence.length * (toneSamples + pauseSamples);

    const audioBuffer = this.audioContext.createBuffer(1, totalSamples, sampleRate);
    const channelData = audioBuffer.getChannelData(0);

    let offset = 0;
    for (const char of dtmfSequence) {
      if (char in DTMF_FREQUENCIES) {
        const [freq1, freq2] = DTMF_FREQUENCIES[char];

        // Generate DTMF tone (sum of two sine waves)
        for (let i = 0; i < toneSamples; i++) {
          const t = i / sampleRate;
          const amplitude = 0.5;  // Prevent clipping
          channelData[offset + i] = amplitude * (
            Math.sin(2 * Math.PI * freq1 * t) +
            Math.sin(2 * Math.PI * freq2 * t)
          ) / 2;
        }

        offset += toneSamples + pauseSamples;
      }
    }

    return audioBuffer;
  }

  /**
   * Play audio tones for peer ID transmission
   */
  async playPeerId(peerId: string): Promise<void> {
    const dtmfSequence = this.encodePeerIdToDTMF(peerId);
    const audioBuffer = await this.generateTones(dtmfSequence);

    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start(0);

    // Return promise that resolves when playback completes
    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  }

  /**
   * Listen for incoming DTMF tones and decode peer ID
   * Currently not implemented. Requires microphone permission and FFT/Goertzel algorithm.
   */
  async listenForPeerId(_durationMs: number): Promise<string | null> {
    throw new Error('Audio listening not implemented');
  }

  /**
   * Cleanup audio resources
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Utility function to create and use audio pairing
 */
export async function pairViaDTMF(peerId: string): Promise<void> {
  const pairing = new AudioTonePairing();
  try {
    await pairing.playPeerId(peerId);
  } finally {
    pairing.cleanup();
  }
}
