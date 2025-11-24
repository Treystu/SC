// Stream Manager - Handles media streams for voice and video
// Task 217: Media stream management

export interface StreamConfig {
  audio: boolean;
  video: boolean;
  audioConstraints?: MediaTrackConstraints;
  videoConstraints?: MediaTrackConstraints;
}

export interface ActiveStream {
  id: string;
  type: 'audio' | 'video' | 'screen';
  stream: MediaStream;
  peerId: string;
  started: number;
  muted: boolean;
}

export class StreamManager {
  private localStreams: Map<string, MediaStream> = new Map();
  private remoteStreams: Map<string, ActiveStream> = new Map();
  private audioContext: AudioContext | null = null;

  async getLocalStream(config: StreamConfig): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: config.audio ? (config.audioConstraints || {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }) : false,
      video: config.video ? (config.videoConstraints || {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      }) : false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const streamId = this.generateStreamId();
      this.localStreams.set(streamId, stream);
      return stream;
    } catch (error) {
      throw new Error(`Failed to get local media stream: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getScreenShare(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
        } as MediaTrackConstraints,
        audio: false,
      });

      const streamId = this.generateStreamId();
      this.localStreams.set(streamId, stream);

      // Handle screen share stop
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        this.stopLocalStream(streamId);
      });

      return stream;
    } catch (error) {
      throw new Error(`Failed to get screen share: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  addRemoteStream(peerId: string, stream: MediaStream, type: ActiveStream['type']): string {
    const streamId = this.generateStreamId();
    const activeStream: ActiveStream = {
      id: streamId,
      type,
      stream,
      peerId,
      started: Date.now(),
      muted: false,
    };

    this.remoteStreams.set(streamId, activeStream);
    return streamId;
  }

  stopLocalStream(streamId: string): void {
    const stream = this.localStreams.get(streamId);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      this.localStreams.delete(streamId);
    }
  }

  removeRemoteStream(streamId: string): void {
    this.remoteStreams.delete(streamId);
  }

  muteStream(streamId: string, muted: boolean): void {
    const localStream = this.localStreams.get(streamId);
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }

    const remoteStream = this.remoteStreams.get(streamId);
    if (remoteStream) {
      remoteStream.muted = muted;
      remoteStream.stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  toggleVideo(streamId: string, enabled: boolean): void {
    const stream = this.localStreams.get(streamId);
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  getAudioLevel(stream: MediaStream): number {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    const source = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
    return average / 255; // Normalize to 0-1
  }

  getRemoteStreams(): ActiveStream[] {
    return Array.from(this.remoteStreams.values());
  }

  getRemoteStreamsByPeer(peerId: string): ActiveStream[] {
    return this.getRemoteStreams().filter((s) => s.peerId === peerId);
  }

  private generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getStatistics() {
    return {
      localStreams: this.localStreams.size,
      remoteStreams: this.remoteStreams.size,
      activeAudio: this.getRemoteStreams().filter((s) => s.type === 'audio' && !s.muted).length,
      activeVideo: this.getRemoteStreams().filter((s) => s.type === 'video').length,
      activeScreen: this.getRemoteStreams().filter((s) => s.type === 'screen').length,
    };
  }

  cleanup(): void {
    this.localStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    this.localStreams.clear();
    this.remoteStreams.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
