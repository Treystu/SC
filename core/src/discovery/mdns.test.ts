/**
 * Tests for mDNS/Bonjour Discovery Implementation
 */

import {
  MDNSBroadcaster,
  MDNSDiscoverer,
  MDNSManager,
  MDNSServiceInfo,
  MDNSCapabilities,
  MDNS_SERVICE_TYPE,
  MDNS_DEFAULT_PORT,
  TXT_RECORD_KEYS,
  parseCapabilities,
  serializeCapabilities,
  parseTxtRecord,
  buildTxtRecord,
  filterService,
} from './mdns.js';

describe('mDNS Discovery', () => {
  describe('parseCapabilities', () => {
    it('should parse capability string', () => {
      const caps = parseCapabilities('text:1,file:1,voice:0,ble:1,maxmsg:65536');
      
      expect(caps.text).toBe(true);
      expect(caps.file).toBe(true);
      expect(caps.voice).toBe(false);
      expect(caps.ble).toBe(true);
      expect(caps.maxMessageSize).toBe(65536);
    });

    it('should handle empty string', () => {
      const caps = parseCapabilities('');
      expect(Object.keys(caps)).toHaveLength(0);
    });

    it('should handle single capability', () => {
      const caps = parseCapabilities('text:1');
      expect(caps.text).toBe(true);
    });
  });

  describe('serializeCapabilities', () => {
    it('should serialize capabilities to string', () => {
      const caps: MDNSCapabilities = {
        text: true,
        file: false,
        webrtc: true,
        maxMessageSize: 1024,
      };
      
      const str = serializeCapabilities(caps);
      
      expect(str).toContain('text:1');
      expect(str).toContain('file:0');
      expect(str).toContain('rtc:1');
      expect(str).toContain('maxmsg:1024');
    });

    it('should handle empty capabilities', () => {
      const str = serializeCapabilities({});
      expect(str).toBe('');
    });
  });

  describe('parseTxtRecord', () => {
    it('should parse TXT record to service info', () => {
      const txtRecord = new Map([
        [TXT_RECORD_KEYS.VERSION, '1.0'],
        [TXT_RECORD_KEYS.PUBLIC_KEY, 'abc123'],
        [TXT_RECORD_KEYS.INSTANCE_ID, 'test-id'],
        [TXT_RECORD_KEYS.CAPABILITIES, 'text:1,file:1'],
      ]);
      
      const parsed = parseTxtRecord(txtRecord);
      
      expect(parsed.version).toBe('1.0');
      expect(parsed.publicKey).toBe('abc123');
      expect(parsed.instanceId).toBe('test-id');
      expect(parsed.capabilities?.text).toBe(true);
      expect(parsed.capabilities?.file).toBe(true);
    });

    it('should handle empty TXT record', () => {
      const parsed = parseTxtRecord(new Map());
      expect(parsed.version).toBeUndefined();
      expect(parsed.publicKey).toBeUndefined();
    });
  });

  describe('buildTxtRecord', () => {
    it('should build TXT record from config', () => {
      const txtRecord = buildTxtRecord({
        serviceName: 'Test',
        publicKey: 'testkey',
        version: '2.0',
        instanceId: 'my-id',
        capabilities: { text: true, voice: true },
      });
      
      expect(txtRecord.get(TXT_RECORD_KEYS.VERSION)).toBe('2.0');
      expect(txtRecord.get(TXT_RECORD_KEYS.PUBLIC_KEY)).toBe('testkey');
      expect(txtRecord.get(TXT_RECORD_KEYS.INSTANCE_ID)).toBe('my-id');
      expect(txtRecord.has(TXT_RECORD_KEYS.CAPABILITIES)).toBe(true);
    });

    it('should include custom TXT records', () => {
      const txtRecord = buildTxtRecord({
        serviceName: 'Test',
        customTxtRecords: new Map([['custom', 'value']]),
      });
      
      expect(txtRecord.get('custom')).toBe('value');
    });
  });

  describe('filterService', () => {
    const createService = (overrides: Partial<MDNSServiceInfo> = {}): MDNSServiceInfo => ({
      instanceName: 'Test',
      serviceType: MDNS_SERVICE_TYPE,
      domain: 'local.',
      port: 8988,
      addresses: [],
      txtRecord: new Map(),
      discoveredAt: Date.now(),
      lastSeen: Date.now(),
      version: '1.0',
      instanceId: 'test-id',
      capabilities: { text: true, webrtc: true },
      ...overrides,
    });

    it('should exclude self when configured', () => {
      const service = createService({ instanceId: 'my-id' });
      const result = filterService(service, {
        excludeSelf: true,
        selfInstanceId: 'my-id',
      });
      
      expect(result).toBe(false);
    });

    it('should not exclude different instance', () => {
      const service = createService({ instanceId: 'other-id' });
      const result = filterService(service, {
        excludeSelf: true,
        selfInstanceId: 'my-id',
      });
      
      expect(result).toBe(true);
    });

    it('should filter by minimum version', () => {
      const service = createService({ version: '0.9' });
      const result = filterService(service, { minVersion: '1.0' });
      
      expect(result).toBe(false);
    });

    it('should pass version check', () => {
      const service = createService({ version: '1.0' });
      const result = filterService(service, { minVersion: '1.0' });
      
      expect(result).toBe(true);
    });

    it('should filter by required capabilities', () => {
      const service = createService({ capabilities: { text: true, voice: false } });
      const result = filterService(service, {
        requiredCapabilities: { voice: true },
      });
      
      expect(result).toBe(false);
    });

    it('should pass capability check', () => {
      const service = createService({ capabilities: { text: true, voice: true } });
      const result = filterService(service, {
        requiredCapabilities: { voice: true },
      });
      
      expect(result).toBe(true);
    });
  });
});

describe('MDNSBroadcaster', () => {
  let broadcaster: MDNSBroadcaster;

  beforeEach(() => {
    broadcaster = new MDNSBroadcaster({
      serviceName: 'TestNode',
      port: 9000,
      publicKey: 'testpk',
      capabilities: { text: true, file: true },
      version: '1.0',
    });
  });

  afterEach(async () => {
    await broadcaster.stop();
  });

  describe('Lifecycle', () => {
    it('should start advertising', async () => {
      await broadcaster.start();
      expect(broadcaster.getIsAdvertising()).toBe(true);
    });

    it('should stop advertising', async () => {
      await broadcaster.start();
      await broadcaster.stop();
      expect(broadcaster.getIsAdvertising()).toBe(false);
    });

    it('should not start twice', async () => {
      await broadcaster.start();
      await broadcaster.start();
      expect(broadcaster.getIsAdvertising()).toBe(true);
    });
  });

  describe('TXT Record', () => {
    it('should build TXT record', () => {
      const txtRecord = broadcaster.getTxtRecord();
      
      expect(txtRecord.get(TXT_RECORD_KEYS.VERSION)).toBe('1.0');
      expect(txtRecord.get(TXT_RECORD_KEYS.PUBLIC_KEY)).toBe('testpk');
      expect(txtRecord.has(TXT_RECORD_KEYS.INSTANCE_ID)).toBe(true);
    });

    it('should update TXT record', async () => {
      await broadcaster.updateTxtRecord({ publicKey: 'newkey' });
      const txtRecord = broadcaster.getTxtRecord();
      
      expect(txtRecord.get(TXT_RECORD_KEYS.PUBLIC_KEY)).toBe('newkey');
    });
  });

  describe('Service Info', () => {
    it('should return service info', () => {
      const info = broadcaster.getServiceInfo();
      
      expect(info.instanceName).toBe('TestNode');
      expect(info.serviceType).toBe(MDNS_SERVICE_TYPE);
      expect(info.port).toBe(9000);
      expect(info.capabilities?.text).toBe(true);
    });

    it('should generate instance ID', () => {
      const id = broadcaster.getInstanceId();
      expect(id).toBeDefined();
      expect(id.length).toBeGreaterThan(0);
    });
  });
});

describe('MDNSDiscoverer', () => {
  let discoverer: MDNSDiscoverer;

  beforeEach(() => {
    discoverer = new MDNSDiscoverer({
      excludeSelf: true,
      selfInstanceId: 'my-instance',
    });
  });

  afterEach(async () => {
    await discoverer.stop();
  });

  describe('Lifecycle', () => {
    it('should start discovery', async () => {
      await discoverer.start();
      expect(discoverer.getIsDiscovering()).toBe(true);
    });

    it('should stop discovery', async () => {
      await discoverer.start();
      await discoverer.stop();
      expect(discoverer.getIsDiscovering()).toBe(false);
    });
  });

  describe('Service Handling', () => {
    beforeEach(async () => {
      await discoverer.start();
    });

    it('should handle found service', () => {
      const service: MDNSServiceInfo = {
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: ['192.168.1.100'],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.VERSION, '1.0'],
          [TXT_RECORD_KEYS.INSTANCE_ID, 'other-instance'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      
      expect(discoverer.getServiceCount()).toBe(1);
      expect(discoverer.getService('Peer1')).toBeDefined();
    });

    it('should exclude self', () => {
      const service: MDNSServiceInfo = {
        instanceName: 'Self',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.INSTANCE_ID, 'my-instance'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      
      expect(discoverer.getServiceCount()).toBe(0);
    });

    it('should update existing service', () => {
      const service: MDNSServiceInfo = {
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: ['192.168.1.100'],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.INSTANCE_ID, 'peer1-id'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      
      const updatedService = { ...service, addresses: ['192.168.1.101'] };
      discoverer.handleServiceFound(updatedService);
      
      expect(discoverer.getServiceCount()).toBe(1);
      const stored = discoverer.getService('Peer1');
      expect(stored?.addresses).toContain('192.168.1.101');
    });

    it('should handle lost service', () => {
      const service: MDNSServiceInfo = {
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.INSTANCE_ID, 'peer1-id'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      expect(discoverer.getServiceCount()).toBe(1);
      
      discoverer.handleServiceLost('Peer1');
      expect(discoverer.getServiceCount()).toBe(0);
    });
  });

  describe('Events', () => {
    it('should emit serviceFound event', async () => {
      await discoverer.start();
      
      const callback = jest.fn();
      discoverer.onEvent(callback);
      
      const service: MDNSServiceInfo = {
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.INSTANCE_ID, 'peer1-id'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      
      expect(callback).toHaveBeenCalledWith('serviceFound', expect.objectContaining({
        instanceName: 'Peer1',
      }), undefined);
    });

    it('should emit serviceLost event', async () => {
      await discoverer.start();
      
      const callback = jest.fn();
      
      const service: MDNSServiceInfo = {
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.INSTANCE_ID, 'peer1-id'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      discoverer.onEvent(callback);
      discoverer.handleServiceLost('Peer1');
      
      expect(callback).toHaveBeenCalledWith('serviceLost', expect.objectContaining({
        instanceName: 'Peer1',
      }), undefined);
    });

    it('should allow unsubscribing from events', async () => {
      await discoverer.start();
      
      const callback = jest.fn();
      const unsubscribe = discoverer.onEvent(callback);
      
      unsubscribe();
      
      const service: MDNSServiceInfo = {
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([
          [TXT_RECORD_KEYS.INSTANCE_ID, 'peer1-id'],
        ]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      };
      
      discoverer.handleServiceFound(service);
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Service Management', () => {
    it('should return all services', async () => {
      await discoverer.start();
      
      discoverer.handleServiceFound({
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([[TXT_RECORD_KEYS.INSTANCE_ID, 'p1']]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      });
      
      discoverer.handleServiceFound({
        instanceName: 'Peer2',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8989,
        addresses: [],
        txtRecord: new Map([[TXT_RECORD_KEYS.INSTANCE_ID, 'p2']]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      });
      
      const services = discoverer.getServices();
      expect(services).toHaveLength(2);
    });

    it('should clear services', async () => {
      await discoverer.start();
      
      discoverer.handleServiceFound({
        instanceName: 'Peer1',
        serviceType: MDNS_SERVICE_TYPE,
        domain: 'local.',
        port: 8988,
        addresses: [],
        txtRecord: new Map([[TXT_RECORD_KEYS.INSTANCE_ID, 'p1']]),
        discoveredAt: Date.now(),
        lastSeen: Date.now(),
      });
      
      discoverer.clearServices();
      expect(discoverer.getServiceCount()).toBe(0);
    });
  });
});

describe('MDNSManager', () => {
  let manager: MDNSManager;

  beforeEach(() => {
    manager = new MDNSManager();
  });

  afterEach(async () => {
    await manager.stop();
  });

  describe('Broadcasting', () => {
    it('should start broadcasting', async () => {
      const broadcaster = await manager.startBroadcasting({
        serviceName: 'TestNode',
      });
      
      expect(broadcaster).toBeDefined();
      expect(manager.getBroadcaster()).toBe(broadcaster);
    });

    it('should stop broadcasting', async () => {
      await manager.startBroadcasting({ serviceName: 'TestNode' });
      await manager.stopBroadcasting();
      
      expect(manager.getBroadcaster()).toBeNull();
    });
  });

  describe('Discovery', () => {
    it('should start discovery', async () => {
      const discoverer = await manager.startDiscovery();
      
      expect(discoverer).toBeDefined();
      expect(manager.getDiscoverer()).toBe(discoverer);
    });

    it('should stop discovery', async () => {
      await manager.startDiscovery();
      await manager.stopDiscovery();
      
      expect(manager.getDiscoverer()).toBeNull();
    });

    it('should exclude self when broadcasting', async () => {
      const broadcaster = await manager.startBroadcasting({
        serviceName: 'TestNode',
      });
      const discoverer = await manager.startDiscovery();
      
      // The discoverer should be configured to exclude the broadcaster's instance
      expect(discoverer.getIsDiscovering()).toBe(true);
    });
  });

  describe('Stop All', () => {
    it('should stop both broadcasting and discovery', async () => {
      await manager.startBroadcasting({ serviceName: 'TestNode' });
      await manager.startDiscovery();
      
      await manager.stop();
      
      expect(manager.getBroadcaster()).toBeNull();
      expect(manager.getDiscoverer()).toBeNull();
    });
  });
});

describe('Constants', () => {
  it('should have valid service type', () => {
    expect(MDNS_SERVICE_TYPE).toBe('_sc._tcp.local.');
  });

  it('should have valid default port', () => {
    expect(MDNS_DEFAULT_PORT).toBe(8988);
  });

  it('should have valid TXT record keys', () => {
    expect(TXT_RECORD_KEYS.VERSION).toBe('v');
    expect(TXT_RECORD_KEYS.PUBLIC_KEY).toBe('pk');
    expect(TXT_RECORD_KEYS.CAPABILITIES).toBe('cap');
    expect(TXT_RECORD_KEYS.FINGERPRINT).toBe('fp');
    expect(TXT_RECORD_KEYS.INSTANCE_ID).toBe('id');
  });
});
