// Audio tone pairing using DTMF (Dual-Tone Multi-Frequency) encoding/decoding

export class AudioTonePairing {
  private audioContext: AudioContext | null = null;
  private analyzer: AnalyserNode | null = null;
  
  // DTMF frequency pairs
  private readonly dtmfFrequencies: Record<string, [number, number]> = {
    '0': [941, 1336], '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477], '7': [852, 1209],
    '8': [852, 1336], '9': [852, 1477], 'A': [697, 1633], 'B': [770, 1633],
    'C': [852, 1633], 'D': [941, 1633], '*': [941, 1209], '#': [941, 1477]
  };
  
  async encodePeerId(peerId: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    
    const sampleRate = this.audioContext.sampleRate;
    const toneDuration = 0.1; // 100ms per tone
    const gapDuration = 0.05; // 50ms gap
    const totalDuration = (toneDuration + gapDuration) * peerId.length;
    
    const buffer = this.audioContext.createBuffer(1, totalDuration * sampleRate, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    let offset = 0;
    for (const char of peerId.toUpperCase()) {
      if (this.dtmfFrequencies[char]) {
        const [freq1, freq2] = this.dtmfFrequencies[char];
        this.generateDTMFTone(channelData, offset, toneDuration, sampleRate, freq1, freq2);
        offset += (toneDuration + gapDuration) * sampleRate;
      }
    }
    
    return buffer;
  }
  
  private generateDTMFTone(
    buffer: Float32Array,
    offset: number,
    duration: number,
    sampleRate: number,
    freq1: number,
    freq2: number
  ): void {
    const samples = duration * sampleRate;
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const amplitude = 0.3;
      buffer[offset + i] = 
        amplitude * Math.sin(2 * Math.PI * freq1 * t) +
        amplitude * Math.sin(2 * Math.PI * freq2 * t);
    }
  }
  
  async playTones(audioBuffer: AudioBuffer): Promise<void> {
    if (!this.audioContext) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();
    
    return new Promise(resolve => {
      source.onended = () => resolve();
    });
  }
  
  async decodePeerId(audioStream: MediaStream): Promise<string> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    
    const source = this.audioContext.createMediaStreamSource(audioStream);
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 2048;
    source.connect(this.analyzer);
    
    const detected: string[] = [];
    const bufferLength = this.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Simplified detection - in production, use Goertzel algorithm
    for (let i = 0; i < 10; i++) {
      this.analyzer.getByteFrequencyData(dataArray);
      const tone = this.detectDTMFTone(dataArray, this.audioContext.sampleRate);
      if (tone) detected.push(tone);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    return detected.join('');
  }
  
  private detectDTMFTone(frequencyData: Uint8Array, _sampleRate: number): string | null {
    // Simplified DTMF detection
    // In production, implement Goertzel algorithm for accurate detection
    const threshold = 50;
    const peaks: number[] = [];
    
    for (let i = 1; i < frequencyData.length - 1; i++) {
      if (frequencyData[i] > threshold &&
          frequencyData[i] > frequencyData[i - 1] &&
          frequencyData[i] > frequencyData[i + 1]) {
        peaks.push(i);
      }
    }
    
    // Match detected peaks to DTMF frequencies
    // Simplified implementation
    return null; // Would return detected character
  }
  
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
