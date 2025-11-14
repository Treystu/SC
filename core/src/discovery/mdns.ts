/**
 * mDNS/Bonjour Service Discovery
 * Tasks 47-48: Implement mDNS-based peer discovery for local network
 * 
 * Provides zero-configuration networking for automatic peer discovery
 * on local networks using multicast DNS (RFC 6762).
 */

export interface MDNSServiceInfo {
  name: string;           // Service instance name
  type: string;           // Service type (e.g., '_sc._tcp')
  domain: string;         // Domain (usually 'local.')
  host: string;           // Hostname
  port: number;           // Port number
  txtRecord: Record<string, string>;  // TXT records for metadata
  addresses: string[];    // IP addresses (IPv4/IPv6)
}

export interface MDNSCapabilities {
  version: string;        // Protocol version
  peerId: string;         // Peer identifier
  publicKey: string;      // Base64-encoded public key
  supportsWebRTC: boolean;
  supportsBLE: boolean;
  supportsFileTransfer: boolean;
  supportsVoice: boolean;
  supportsVideo: boolean;
  maxFileSize?: number;   // Max file size in bytes
}

export interface MDNSBroadcasterOptions {
  serviceName: string;    // Instance name (e.g., 'John's Device')
  serviceType: string;    // Service type (default: '_sc._tcp')
  domain: string;         // Domain (default: 'local.')
  port: number;           // Port to advertise
  capabilities: MDNSCapabilities;
  ttl?: number;           // Time-to-live for records (default: 120s)
}

export interface MDNSDiscoveryOptions {
  serviceType: string;    // Service type to discover
  domain?: string;        // Domain to search (default: 'local.')
  timeout?: number;       // Discovery timeout in ms (default: 5000)
  filter?: (service: MDNSServiceInfo) => boolean;  // Filter function
}

/**
 * mDNS Service Broadcaster
 * Advertises local service on the network
 */
export class MDNSBroadcaster {
  private options: MDNSBroadcasterOptions;
  private advertising = false;
  private broadcastInterval: NodeJS.Timeout | null = null;

  constructor(options: MDNSBroadcasterOptions) {
    this.options = {
      ...options,
      serviceType: options.serviceType || '_sc._tcp',
      domain: options.domain || 'local.',
      ttl: options.ttl || 120,
    };
  }

  /**
   * Start advertising service
   */
  async start(): Promise<void> {
    if (this.advertising) {
      return;
    }

    this.advertising = true;

    // In a real implementation, this would use platform-specific mDNS APIs
    // (e.g., dns-sd on macOS/iOS, Bonjour on Windows, Avahi on Linux)
    // For browser environments, this is not directly supported
    
    // Broadcast service every 30 seconds to maintain presence
    this.broadcastInterval = setInterval(() => {
      this.sendServiceAnnouncement();
    }, 30000);

    // Initial announcement
    this.sendServiceAnnouncement();
  }

  /**
   * Stop advertising service
   */
  async stop(): Promise<void> {
    if (!this.advertising) {
      return;
    }

    this.advertising = false;

    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    // Send goodbye message
    this.sendServiceGoodbye();
  }

  /**
   * Check if currently advertising
   */
  isAdvertising(): boolean {
    return this.advertising;
  }

  /**
   * Get service information
   */
  getServiceInfo(): MDNSServiceInfo {
    return {
      name: this.options.serviceName,
      type: this.options.serviceType,
      domain: this.options.domain,
      host: this.getHostname(),
      port: this.options.port,
      txtRecord: this.createTXTRecord(),
      addresses: this.getLocalAddresses(),
    };
  }

  /**
   * Create TXT record from capabilities
   */
  private createTXTRecord(): Record<string, string> {
    const caps = this.options.capabilities;
    
    return {
      version: caps.version,
      peerId: caps.peerId,
      publicKey: caps.publicKey,
      webrtc: caps.supportsWebRTC ? '1' : '0',
      ble: caps.supportsBLE ? '1' : '0',
      file: caps.supportsFileTransfer ? '1' : '0',
      voice: caps.supportsVoice ? '1' : '0',
      video: caps.supportsVideo ? '1' : '0',
      maxFileSize: caps.maxFileSize?.toString() || '0',
      txtvers: '1',  // TXT record version
    };
  }

  /**
   * Send service announcement
   */
  private sendServiceAnnouncement(): void {
    // Platform-specific implementation would go here
    // This is a placeholder for the actual mDNS broadcast
    console.log('[mDNS] Announcing service:', this.options.serviceName);
  }

  /**
   * Send goodbye message when stopping
   */
  private sendServiceGoodbye(): void {
    // Platform-specific implementation would go here
    console.log('[mDNS] Goodbye:', this.options.serviceName);
  }

  /**
   * Get hostname for this device
   */
  private getHostname(): string {
    // In browser: use a generated hostname
    // In Node.js: use os.hostname()
    if (typeof window !== 'undefined') {
      return `sc-${this.options.capabilities.peerId.substring(0, 8)}.local.`;
    }
    
    // Node.js implementation would use os.hostname()
    return 'localhost';
  }

  /**
   * Get local IP addresses
   */
  private getLocalAddresses(): string[] {
    // Platform-specific implementation
    // Would use network interfaces to get actual IPs
    return [];
  }
}

/**
 * mDNS Service Discovery
 * Discovers peers on the local network
 */
export class MDNSDiscoverer {
  private options: MDNSDiscoveryOptions;
  private scanning = false;
  private discoveredServices = new Map<string, MDNSServiceInfo>();
  private listeners = new Map<string, Set<Function>>();
  private scanInterval: NodeJS.Timeout | null = null;

  constructor(serviceType: string, options: Partial<MDNSDiscoveryOptions> = {}) {
    this.options = {
      serviceType,
      domain: 'local.',
      timeout: 5000,
      ...options,
    };
  }

  /**
   * Start discovering services
   */
  async start(): Promise<void> {
    if (this.scanning) {
      return;
    }

    this.scanning = true;

    // In a real implementation, this would register with mDNS responder
    // and listen for service announcements
    
    // Periodic scanning
    this.scanInterval = setInterval(() => {
      this.performScan();
    }, this.options.timeout);

    // Initial scan
    this.performScan();
  }

  /**
   * Stop discovering services
   */
  async stop(): Promise<void> {
    if (!this.scanning) {
      return;
    }

    this.scanning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  /**
   * Check if currently scanning
   */
  isScanning(): boolean {
    return this.scanning;
  }

  /**
   * Get all discovered peers
   */
  getPeers(): MDNSServiceInfo[] {
    return Array.from(this.discoveredServices.values());
  }

  /**
   * Get specific peer by ID
   */
  getPeer(peerId: string): MDNSServiceInfo | null {
    return this.discoveredServices.get(peerId) || null;
  }

  /**
   * Register event listener
   */
  on(event: 'peer-found' | 'peer-lost' | 'peer-updated', callback: (service: MDNSServiceInfo) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  off(event: string, callback: (...args: any[]) => any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(callback);
    }
  }

  /**
   * Emit event to listeners
   */
  private emit(event: string, data: any): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  /**
   * Perform service discovery scan
   */
  private performScan(): void {
    // Platform-specific implementation would query mDNS responder
    // This is a placeholder
    console.log('[mDNS] Scanning for services:', this.options.serviceType);
    
    // In real implementation, would receive service announcements
    // and call this.handleServiceFound(serviceInfo)
  }

  /**
   * Handle discovered service
   */
  handleServiceFound(service: MDNSServiceInfo): void {
    // Apply filter if provided
    if (this.options.filter && !this.options.filter(service)) {
      return;
    }

    const peerId = service.txtRecord.peerId;
    if (!peerId) {
      return;
    }

    const existing = this.discoveredServices.get(peerId);
    
    if (!existing) {
      // New service discovered
      this.discoveredServices.set(peerId, service);
      this.emit('peer-found', service);
    } else {
      // Service updated
      this.discoveredServices.set(peerId, service);
      this.emit('peer-updated', service);
    }
  }

  /**
   * Handle service lost
   */
  handleServiceLost(peerId: string): void {
    const service = this.discoveredServices.get(peerId);
    if (service) {
      this.discoveredServices.delete(peerId);
      this.emit('peer-lost', service);
    }
  }

  /**
   * Parse TXT record to capabilities
   */
  static parseTXTRecord(txtRecord: Record<string, string>): MDNSCapabilities | null {
    try {
      return {
        version: txtRecord.version || '1.0.0',
        peerId: txtRecord.peerId,
        publicKey: txtRecord.publicKey,
        supportsWebRTC: txtRecord.webrtc === '1',
        supportsBLE: txtRecord.ble === '1',
        supportsFileTransfer: txtRecord.file === '1',
        supportsVoice: txtRecord.voice === '1',
        supportsVideo: txtRecord.video === '1',
        maxFileSize: txtRecord.maxFileSize ? parseInt(txtRecord.maxFileSize) : undefined,
      };
    } catch {
      return null;
    }
  }
}

/**
 * Utility functions
 */

/**
 * Create service type string
 */
export function createServiceType(protocol: 'tcp' | 'udp' = 'tcp'): string {
  return `_sc._${protocol}`;
}

/**
 * Validate service name
 */
export function validateServiceName(name: string): boolean {
  // RFC 6763: Service instance names must be valid UTF-8
  // and should not contain dots except as delimiters
  if (!name || name.length === 0 || name.length > 63) {
    return false;
  }
  
  // Check for invalid characters
  const invalidChars = /[<>"]/;
  return !invalidChars.test(name);
}

/**
 * Format service instance name
 */
export function formatServiceInstanceName(name: string, type: string, domain: string): string {
  return `${name}.${type}.${domain}`;
}
