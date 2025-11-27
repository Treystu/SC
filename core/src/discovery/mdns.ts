// @ts-ignore
// import mDNS from 'multicast-dns'; // Converted to dynamic import for browser compatibility

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
  private mdns: any = null;

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

    // Initialize mDNS if in Node.js environment
    if (typeof window === 'undefined') {
      try {
        // Dynamic import to avoid bundling in browser
        // @ts-ignore
        const mDNSModule = await import('multicast-dns');
        const mDNS = (mDNSModule as any).default || mDNSModule;
        this.mdns = mDNS();

        this.mdns.on('query', (query: any) => {
          if (this.shouldRespondToQuery(query)) {
            this.sendServiceAnnouncement();
          }
        });

        console.log('[mDNS] Started broadcaster');
      } catch (error) {
        console.error('[mDNS] Failed to initialize broadcaster:', error);
      }
    }

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

    if (this.mdns) {
      this.mdns.destroy();
      this.mdns = null;
    }
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

  private shouldRespondToQuery(query: any): boolean {
    return query.questions.some((q: any) =>
      q.name === this.options.serviceType ||
      q.name === this.options.serviceType + '.' + this.options.domain
    );
  }

  /**
   * Send service announcement
   */
  private sendServiceAnnouncement(): void {
    if (!this.mdns) return;

    const serviceName = `${this.options.serviceName}.${this.options.serviceType}.${this.options.domain}`;

    try {
      this.mdns.respond({
        answers: [
          {
            name: serviceName,
            type: 'SRV',
            data: {
              port: this.options.port,
              weight: 0,
              priority: 10,
              target: this.getHostname()
            }
          },
          {
            name: serviceName,
            type: 'TXT',
            data: Object.entries(this.createTXTRecord()).map(([k, v]) => `${k}=${v}`)
          },
          {
            name: this.options.serviceType + '.' + this.options.domain,
            type: 'PTR',
            data: serviceName
          },
          ...this.getLocalAddresses().map(addr => ({
            name: this.getHostname(),
            type: 'A', // Assuming IPv4 for simplicity
            data: addr
          }))
        ]
      });
      console.log('[mDNS] Announced service:', this.options.serviceName);
    } catch (error) {
      console.error('[mDNS] Failed to announce:', error);
    }
  }

  /**
   * Send goodbye message when stopping
   */
  private sendServiceGoodbye(): void {
    if (!this.mdns) return;

    // Send with TTL 0 to remove
    // Implementation omitted for brevity, usually similar to announce but TTL 0
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
    if (typeof window === 'undefined') {
      try {
        // Use require to avoid build issues in browser environment
        // @ts-ignore
        const os = require('os');
        const interfaces = os.networkInterfaces();
        const addresses: string[] = [];

        Object.keys(interfaces).forEach((ifname) => {
          interfaces[ifname]?.forEach((iface: any) => {
            // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
            if ('IPv4' !== iface.family || iface.internal !== false) {
              return;
            }
            addresses.push(iface.address);
          });
        });

        return addresses;
      } catch (e) {
        console.error('Failed to get local addresses:', e);
        return [];
      }
    }
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
  private listeners = new Map<string, Set<(...args: any[]) => any>>();
  private scanInterval: NodeJS.Timeout | null = null;
  private mdns: any = null;

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

    if (typeof window === 'undefined') {
      try {
        // Dynamic import to avoid bundling in browser
        // @ts-ignore
        const mDNSModule = await import('multicast-dns');
        const mDNS = (mDNSModule as any).default || mDNSModule;
        this.mdns = mDNS();

        this.mdns.on('response', (response: any) => {
          this.handleResponse(response);
        });

        console.log('[mDNS] Started discoverer');
      } catch (error) {
        console.error('[mDNS] Failed to initialize discoverer:', error);
      }
    }

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

    if (this.mdns) {
      this.mdns.destroy();
      this.mdns = null;
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
    if (!this.mdns) return;

    try {
      this.mdns.query({
        questions: [{
          name: this.options.serviceType + '.' + this.options.domain,
          type: 'PTR'
        }]
      });
      console.log('[mDNS] Scanning for services:', this.options.serviceType);
    } catch (error) {
      console.error('[mDNS] Scan failed:', error);
    }
  }

  private handleResponse(response: any): void {
    // Parse response and extract service info
    // This is a simplified parsing logic

    response.answers.forEach((answer: any) => {
      if (answer.type === 'PTR' && answer.name === this.options.serviceType + '.' + this.options.domain) {
        // Found a service instance
        const instanceName = answer.data;

        // Find related records (SRV, TXT, A)
        const srv = response.answers.find((a: any) => a.type === 'SRV' && a.name === instanceName);
        const txt = response.answers.find((a: any) => a.type === 'TXT' && a.name === instanceName);
        const a = response.answers.find((a: any) => a.type === 'A' && a.name === srv?.data.target);

        if (srv && txt) {
          const txtDict: Record<string, string> = {};
          // Handle TXT data (array of strings or buffer)
          const txtData = Array.isArray(txt.data) ? txt.data : [txt.data];
          txtData.forEach((item: any) => {
            const str = item.toString();
            const [k, v] = str.split('=');
            if (k && v) txtDict[k] = v;
          });

          const serviceInfo: MDNSServiceInfo = {
            name: instanceName,
            type: this.options.serviceType,
            domain: this.options.domain || 'local.',
            host: srv.data.target,
            port: srv.data.port,
            txtRecord: txtDict,
            addresses: a ? [a.data] : []
          };

          this.handleServiceFound(serviceInfo);
        }
      }
    });
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
