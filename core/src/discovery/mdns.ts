/**
 * mDNS/Bonjour Discovery Implementation
 * 
 * Provides local network peer discovery using multicast DNS (mDNS).
 * This implementation works for web (via native bridge) and can be
 * adapted for Android/iOS native implementations.
 * 
 * Service Type: _sc._tcp.local.
 * 
 * Security Note: mDNS broadcasts are visible to all devices on the local network.
 * Consider privacy implications before enabling automatic discovery.
 */

/**
 * mDNS service type for SC mesh networking
 */
export const MDNS_SERVICE_TYPE = '_sc._tcp.local.';

/**
 * Default mDNS port
 */
export const MDNS_DEFAULT_PORT = 8988;

/**
 * TXT record keys for service metadata
 */
export const TXT_RECORD_KEYS = {
  VERSION: 'v',
  PUBLIC_KEY: 'pk',
  CAPABILITIES: 'cap',
  FINGERPRINT: 'fp',
  INSTANCE_ID: 'id',
} as const;

/**
 * Service capabilities advertised via TXT records
 */
export interface MDNSCapabilities {
  /** Supports text messaging */
  text?: boolean;
  /** Supports file transfer */
  file?: boolean;
  /** Supports voice calls */
  voice?: boolean;
  /** Supports video calls */
  video?: boolean;
  /** Supports BLE transport */
  ble?: boolean;
  /** Supports Wi-Fi Direct */
  wifiDirect?: boolean;
  /** Supports WebRTC */
  webrtc?: boolean;
  /** Maximum message size supported */
  maxMessageSize?: number;
}

/**
 * Discovered service information
 */
export interface MDNSServiceInfo {
  /** Service instance name */
  instanceName: string;
  /** Service type */
  serviceType: string;
  /** Domain */
  domain: string;
  /** Resolved hostname */
  hostname?: string;
  /** Port number */
  port: number;
  /** IP addresses (IPv4 and IPv6) */
  addresses: string[];
  /** TXT record data */
  txtRecord: Map<string, string>;
  /** Parsed capabilities from TXT record */
  capabilities?: MDNSCapabilities;
  /** Public key from TXT record */
  publicKey?: string;
  /** Fingerprint from TXT record */
  fingerprint?: string;
  /** Protocol version */
  version?: string;
  /** Instance ID */
  instanceId?: string;
  /** Discovery timestamp */
  discoveredAt: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** Time-to-live in seconds */
  ttl?: number;
}

/**
 * mDNS broadcaster configuration
 */
export interface MDNSBroadcasterConfig {
  /** Service instance name (defaults to device name) */
  serviceName: string;
  /** Port to advertise */
  port?: number;
  /** Public key to advertise */
  publicKey?: string;
  /** Capabilities to advertise */
  capabilities?: MDNSCapabilities;
  /** Protocol version */
  version?: string;
  /** Instance ID */
  instanceId?: string;
  /** Custom TXT record entries */
  customTxtRecords?: Map<string, string>;
}

/**
 * mDNS discoverer configuration
 */
export interface MDNSDiscovererConfig {
  /** Service types to discover (defaults to SC service) */
  serviceTypes?: string[];
  /** Discovery timeout in milliseconds (0 = continuous) */
  timeout?: number;
  /** Minimum version to accept */
  minVersion?: string;
  /** Required capabilities filter */
  requiredCapabilities?: Partial<MDNSCapabilities>;
  /** Exclude own service */
  excludeSelf?: boolean;
  /** Own instance ID to exclude */
  selfInstanceId?: string;
}

/**
 * Event types for mDNS events
 */
export type MDNSEventType = 'serviceFound' | 'serviceLost' | 'serviceUpdated' | 'error';

/**
 * mDNS event callback
 */
export type MDNSEventCallback = (event: MDNSEventType, service?: MDNSServiceInfo, error?: Error) => void;

/**
 * Parse TXT record string to capabilities object
 */
export function parseCapabilities(capString: string): MDNSCapabilities {
  const caps: MDNSCapabilities = {};
  const flags = capString.split(',');
  
  for (const flag of flags) {
    const [key, value] = flag.split(':');
    switch (key) {
      case 'text':
        caps.text = value !== '0';
        break;
      case 'file':
        caps.file = value !== '0';
        break;
      case 'voice':
        caps.voice = value !== '0';
        break;
      case 'video':
        caps.video = value !== '0';
        break;
      case 'ble':
        caps.ble = value !== '0';
        break;
      case 'wfd':
        caps.wifiDirect = value !== '0';
        break;
      case 'rtc':
        caps.webrtc = value !== '0';
        break;
      case 'maxmsg':
        caps.maxMessageSize = parseInt(value, 10);
        break;
    }
  }
  
  return caps;
}

/**
 * Serialize capabilities to TXT record string
 */
export function serializeCapabilities(caps: MDNSCapabilities): string {
  const parts: string[] = [];
  
  if (caps.text !== undefined) parts.push(`text:${caps.text ? '1' : '0'}`);
  if (caps.file !== undefined) parts.push(`file:${caps.file ? '1' : '0'}`);
  if (caps.voice !== undefined) parts.push(`voice:${caps.voice ? '1' : '0'}`);
  if (caps.video !== undefined) parts.push(`video:${caps.video ? '1' : '0'}`);
  if (caps.ble !== undefined) parts.push(`ble:${caps.ble ? '1' : '0'}`);
  if (caps.wifiDirect !== undefined) parts.push(`wfd:${caps.wifiDirect ? '1' : '0'}`);
  if (caps.webrtc !== undefined) parts.push(`rtc:${caps.webrtc ? '1' : '0'}`);
  if (caps.maxMessageSize !== undefined) parts.push(`maxmsg:${caps.maxMessageSize}`);
  
  return parts.join(',');
}

/**
 * Parse TXT record to MDNSServiceInfo properties
 */
export function parseTxtRecord(txtRecord: Map<string, string>): Partial<MDNSServiceInfo> {
  const result: Partial<MDNSServiceInfo> = {};
  
  if (txtRecord.has(TXT_RECORD_KEYS.VERSION)) {
    result.version = txtRecord.get(TXT_RECORD_KEYS.VERSION);
  }
  
  if (txtRecord.has(TXT_RECORD_KEYS.PUBLIC_KEY)) {
    result.publicKey = txtRecord.get(TXT_RECORD_KEYS.PUBLIC_KEY);
  }
  
  if (txtRecord.has(TXT_RECORD_KEYS.FINGERPRINT)) {
    result.fingerprint = txtRecord.get(TXT_RECORD_KEYS.FINGERPRINT);
  }
  
  if (txtRecord.has(TXT_RECORD_KEYS.INSTANCE_ID)) {
    result.instanceId = txtRecord.get(TXT_RECORD_KEYS.INSTANCE_ID);
  }
  
  if (txtRecord.has(TXT_RECORD_KEYS.CAPABILITIES)) {
    result.capabilities = parseCapabilities(txtRecord.get(TXT_RECORD_KEYS.CAPABILITIES)!);
  }
  
  return result;
}

/**
 * Build TXT record from service info
 */
export function buildTxtRecord(config: MDNSBroadcasterConfig): Map<string, string> {
  const txtRecord = new Map<string, string>();
  
  if (config.version) {
    txtRecord.set(TXT_RECORD_KEYS.VERSION, config.version);
  }
  
  if (config.publicKey) {
    txtRecord.set(TXT_RECORD_KEYS.PUBLIC_KEY, config.publicKey);
  }
  
  if (config.instanceId) {
    txtRecord.set(TXT_RECORD_KEYS.INSTANCE_ID, config.instanceId);
  }
  
  if (config.capabilities) {
    txtRecord.set(TXT_RECORD_KEYS.CAPABILITIES, serializeCapabilities(config.capabilities));
  }
  
  // Add custom TXT records
  if (config.customTxtRecords) {
    for (const [key, value] of config.customTxtRecords) {
      txtRecord.set(key, value);
    }
  }
  
  return txtRecord;
}

/**
 * Filter services based on discovery config
 */
export function filterService(
  service: MDNSServiceInfo,
  config: MDNSDiscovererConfig
): boolean {
  // Exclude self
  if (config.excludeSelf && config.selfInstanceId && service.instanceId === config.selfInstanceId) {
    return false;
  }
  
  // Check minimum version
  if (config.minVersion && service.version) {
    if (service.version < config.minVersion) {
      return false;
    }
  }
  
  // Check required capabilities
  if (config.requiredCapabilities && service.capabilities) {
    const reqCaps = config.requiredCapabilities;
    const svcCaps = service.capabilities;
    
    if (reqCaps.text && !svcCaps.text) return false;
    if (reqCaps.file && !svcCaps.file) return false;
    if (reqCaps.voice && !svcCaps.voice) return false;
    if (reqCaps.video && !svcCaps.video) return false;
    if (reqCaps.ble && !svcCaps.ble) return false;
    if (reqCaps.wifiDirect && !svcCaps.wifiDirect) return false;
    if (reqCaps.webrtc && !svcCaps.webrtc) return false;
  }
  
  return true;
}

/**
 * mDNS Service Broadcaster
 * Advertises this device as a SC mesh node on the local network.
 */
export class MDNSBroadcaster {
  private config: Required<Omit<MDNSBroadcasterConfig, 'customTxtRecords'>> & { customTxtRecords?: Map<string, string> };
  private isAdvertising = false;
  private txtRecord: Map<string, string>;
  
  constructor(config: MDNSBroadcasterConfig) {
    this.config = {
      serviceName: config.serviceName,
      port: config.port ?? MDNS_DEFAULT_PORT,
      publicKey: config.publicKey ?? '',
      capabilities: config.capabilities ?? { text: true, webrtc: true },
      version: config.version ?? '1.0',
      instanceId: config.instanceId ?? this.generateInstanceId(),
      customTxtRecords: config.customTxtRecords,
    };
    
    this.txtRecord = buildTxtRecord(this.config);
  }
  
  private generateInstanceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  
  /**
   * Start advertising the service
   */
  async start(): Promise<void> {
    if (this.isAdvertising) {
      return;
    }
    
    // Note: Actual mDNS advertising requires platform-specific implementation
    // This is a mock implementation for testing and documentation
    this.isAdvertising = true;
    
    console.log(`[mDNS] Started advertising: ${this.config.serviceName}._sc._tcp.local. on port ${this.config.port}`);
  }
  
  /**
   * Stop advertising the service
   */
  async stop(): Promise<void> {
    if (!this.isAdvertising) {
      return;
    }
    
    this.isAdvertising = false;
    console.log(`[mDNS] Stopped advertising: ${this.config.serviceName}`);
  }
  
  /**
   * Update TXT record while advertising
   */
  async updateTxtRecord(updates: Partial<MDNSBroadcasterConfig>): Promise<void> {
    if (updates.publicKey !== undefined) {
      this.config.publicKey = updates.publicKey;
    }
    if (updates.capabilities !== undefined) {
      this.config.capabilities = updates.capabilities;
    }
    if (updates.version !== undefined) {
      this.config.version = updates.version;
    }
    
    this.txtRecord = buildTxtRecord(this.config);
    
    if (this.isAdvertising) {
      // In a real implementation, this would update the mDNS advertisement
      console.log('[mDNS] Updated TXT record');
    }
  }
  
  /**
   * Check if currently advertising
   */
  getIsAdvertising(): boolean {
    return this.isAdvertising;
  }
  
  /**
   * Get the current TXT record
   */
  getTxtRecord(): Map<string, string> {
    return new Map(this.txtRecord);
  }
  
  /**
   * Get the instance ID
   */
  getInstanceId(): string {
    return this.config.instanceId;
  }
  
  /**
   * Get service info for this broadcaster
   */
  getServiceInfo(): MDNSServiceInfo {
    return {
      instanceName: this.config.serviceName,
      serviceType: MDNS_SERVICE_TYPE,
      domain: 'local.',
      hostname: undefined,
      port: this.config.port,
      addresses: [],
      txtRecord: this.txtRecord,
      capabilities: this.config.capabilities,
      publicKey: this.config.publicKey,
      version: this.config.version,
      instanceId: this.config.instanceId,
      discoveredAt: Date.now(),
      lastSeen: Date.now(),
    };
  }
}

/**
 * mDNS Service Discoverer
 * Discovers SC mesh nodes on the local network.
 */
export class MDNSDiscoverer {
  private config: MDNSDiscovererConfig;
  private services: Map<string, MDNSServiceInfo> = new Map();
  private callbacks: Set<MDNSEventCallback> = new Set();
  private isDiscovering = false;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  /** Service expiration time in milliseconds */
  private readonly SERVICE_EXPIRY_MS = 120000; // 2 minutes
  
  /** Cleanup interval in milliseconds */
  private readonly CLEANUP_INTERVAL_MS = 30000; // 30 seconds
  
  constructor(config: MDNSDiscovererConfig = {}) {
    this.config = {
      serviceTypes: config.serviceTypes ?? [MDNS_SERVICE_TYPE],
      timeout: config.timeout ?? 0, // Continuous by default
      minVersion: config.minVersion,
      requiredCapabilities: config.requiredCapabilities,
      excludeSelf: config.excludeSelf ?? true,
      selfInstanceId: config.selfInstanceId,
    };
  }
  
  /**
   * Start discovery
   */
  async start(): Promise<void> {
    if (this.isDiscovering) {
      return;
    }
    
    this.isDiscovering = true;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredServices();
    }, this.CLEANUP_INTERVAL_MS);
    
    console.log(`[mDNS] Started discovery for: ${this.config.serviceTypes?.join(', ')}`);
    
    // In a real implementation, this would start mDNS query
    // For mock, we simulate periodic discovery
    if (this.config.timeout && this.config.timeout > 0) {
      setTimeout(() => {
        this.stop();
      }, this.config.timeout);
    }
  }
  
  /**
   * Stop discovery
   */
  async stop(): Promise<void> {
    if (!this.isDiscovering) {
      return;
    }
    
    this.isDiscovering = false;
    
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    console.log('[mDNS] Stopped discovery');
  }
  
  /**
   * Register callback for discovery events
   */
  onEvent(callback: MDNSEventCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }
  
  /**
   * Emit event to all callbacks
   */
  private emit(event: MDNSEventType, service?: MDNSServiceInfo, error?: Error): void {
    for (const callback of this.callbacks) {
      try {
        callback(event, service, error);
      } catch (err) {
        console.error('[mDNS] Error in event callback:', err);
      }
    }
  }
  
  /**
   * Handle discovered service (called by platform implementation)
   */
  handleServiceFound(service: MDNSServiceInfo): void {
    // Parse TXT record
    const parsed = parseTxtRecord(service.txtRecord);
    Object.assign(service, parsed);
    
    // Apply filter
    if (!filterService(service, this.config)) {
      return;
    }
    
    const key = `${service.instanceName}.${service.serviceType}`;
    const existing = this.services.get(key);
    
    if (existing) {
      // Update existing service
      service.discoveredAt = existing.discoveredAt;
      service.lastSeen = Date.now();
      this.services.set(key, service);
      this.emit('serviceUpdated', service);
    } else {
      // New service
      service.discoveredAt = Date.now();
      service.lastSeen = Date.now();
      this.services.set(key, service);
      this.emit('serviceFound', service);
    }
  }
  
  /**
   * Handle service removal
   */
  handleServiceLost(instanceName: string, serviceType: string = MDNS_SERVICE_TYPE): void {
    const key = `${instanceName}.${serviceType}`;
    const service = this.services.get(key);
    
    if (service) {
      this.services.delete(key);
      this.emit('serviceLost', service);
    }
  }
  
  /**
   * Clean up expired services
   */
  private cleanupExpiredServices(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, service] of this.services) {
      if (now - service.lastSeen > this.SERVICE_EXPIRY_MS) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      const service = this.services.get(key);
      this.services.delete(key);
      if (service) {
        this.emit('serviceLost', service);
      }
    }
  }
  
  /**
   * Get all discovered services
   */
  getServices(): MDNSServiceInfo[] {
    return Array.from(this.services.values());
  }
  
  /**
   * Get a specific service by instance name
   */
  getService(instanceName: string, serviceType: string = MDNS_SERVICE_TYPE): MDNSServiceInfo | undefined {
    return this.services.get(`${instanceName}.${serviceType}`);
  }
  
  /**
   * Check if currently discovering
   */
  getIsDiscovering(): boolean {
    return this.isDiscovering;
  }
  
  /**
   * Get service count
   */
  getServiceCount(): number {
    return this.services.size;
  }
  
  /**
   * Clear all discovered services
   */
  clearServices(): void {
    this.services.clear();
  }
}

/**
 * Combined mDNS manager for both broadcasting and discovering
 */
export class MDNSManager {
  private broadcaster: MDNSBroadcaster | null = null;
  private discoverer: MDNSDiscoverer | null = null;
  
  /**
   * Start advertising this device
   */
  async startBroadcasting(config: MDNSBroadcasterConfig): Promise<MDNSBroadcaster> {
    if (this.broadcaster) {
      await this.broadcaster.stop();
    }
    
    this.broadcaster = new MDNSBroadcaster(config);
    await this.broadcaster.start();
    return this.broadcaster;
  }
  
  /**
   * Stop advertising
   */
  async stopBroadcasting(): Promise<void> {
    if (this.broadcaster) {
      await this.broadcaster.stop();
      this.broadcaster = null;
    }
  }
  
  /**
   * Start discovering peers
   */
  async startDiscovery(config?: MDNSDiscovererConfig): Promise<MDNSDiscoverer> {
    if (this.discoverer) {
      await this.discoverer.stop();
    }
    
    // Pass broadcaster's instance ID to exclude self
    const discoveryConfig: MDNSDiscovererConfig = {
      ...config,
      excludeSelf: true,
      selfInstanceId: this.broadcaster?.getInstanceId(),
    };
    
    this.discoverer = new MDNSDiscoverer(discoveryConfig);
    await this.discoverer.start();
    return this.discoverer;
  }
  
  /**
   * Stop discovering
   */
  async stopDiscovery(): Promise<void> {
    if (this.discoverer) {
      await this.discoverer.stop();
      this.discoverer = null;
    }
  }
  
  /**
   * Stop all mDNS activity
   */
  async stop(): Promise<void> {
    await this.stopBroadcasting();
    await this.stopDiscovery();
  }
  
  /**
   * Get broadcaster instance
   */
  getBroadcaster(): MDNSBroadcaster | null {
    return this.broadcaster;
  }
  
  /**
   * Get discoverer instance
   */
  getDiscoverer(): MDNSDiscoverer | null {
    return this.discoverer;
  }
}
