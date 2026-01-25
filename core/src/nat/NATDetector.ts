export enum NATType {
  OPEN = "open",
  MODERATE = "moderate",
  STRICT = "strict",
  SYMMETRIC = "symmetric",
  UNKNOWN = "unknown",
}

export interface NATProfile {
  type: NATType;
  publicIP?: string;
  isWAN: boolean;
  detectedAt: number;
}

export class NATDetector {
  private static STUN_SERVERS = [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
  ];

  async detect(): Promise<NATProfile> {
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: NATDetector.STUN_SERVERS }],
      });

      const candidates: RTCIceCandidate[] = [];
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidates.push(event.candidate);
        }
      };

      // Create a dummy data channel to trigger ICE
      pc.createDataChannel("nat-detection");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete (or timeout)
      await new Promise<void>((resolve) => {
        const check = () => {
          if (pc.iceGatheringState === "complete") resolve();
          else setTimeout(check, 500);
        };
        check();
        setTimeout(resolve, 5000); // 5s timeout
      });

      const profile = this.analyzeCandidates(candidates);
      pc.close();
      return profile;
    } catch (e) {
      console.error("[NATDetector] Detection failed:", e);
      return {
        type: NATType.UNKNOWN,
        isWAN: false,
        detectedAt: Date.now(),
      };
    }
  }

  private analyzeCandidates(candidates: RTCIceCandidate[]): NATProfile {
    let publicIP: string | undefined;
    let hasSrflx = false;
    let hasRelay = false;
    let hasHost = false;

    for (const c of candidates) {
      const candidateStr = c.candidate;
      if (candidateStr.includes("srflx")) {
        hasSrflx = true;
        // Extract IP (very rough regex)
        const parts = candidateStr.split(" ");
        if (parts.length > 4) publicIP = parts[4];
      }
      if (candidateStr.includes("relay")) hasRelay = true;
      if (candidateStr.includes("host")) hasHost = true;
    }

    // Rough classification
    let type = NATType.UNKNOWN;
    if (hasSrflx) {
      type = hasRelay ? NATType.MODERATE : NATType.OPEN;
    } else if (hasHost) {
      type = NATType.STRICT;
    }

    return {
      type,
      publicIP,
      isWAN: !!publicIP && !this.isPrivateIP(publicIP),
      detectedAt: Date.now(),
    };
  }

  private isPrivateIP(ip: string): boolean {
    return (
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      ip.startsWith("172.16.") || // Rough 172.16.0.0/12
      ip.startsWith("127.")
    );
  }
}
