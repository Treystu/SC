/**
 * Tests for mDNS/Bonjour Service Discovery
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  MDNSBroadcaster,
  MDNSDiscoverer,
  createServiceType,
  validateServiceName,
  formatServiceInstanceName,
  type MDNSCapabilities,
  type MDNSServiceInfo,
} from './mdns';

describe('mDNS Service Discovery', () => {
  describe('MDNSBroadcaster', () => {
    let broadcaster: MDNSBroadcaster;
    const testCapabilities: MDNSCapabilities = {
      version: '1.0.0',
      peerId: 'test-peer-123',
      publicKey: 'dGVzdC1wdWJsaWMta2V5',
      supportsWebRTC: true,
      supportsBLE: false,
      supportsFileTransfer: true,
      supportsVoice: true,
      supportsVideo: false,
    };

    beforeEach(() => {
      broadcaster = new MDNSBroadcaster({
        serviceName: 'Test Device',
        serviceType: '_sc._tcp',
        domain: 'local.',
        port: 8080,
        capabilities: testCapabilities,
      });
    });

    afterEach(async () => {
      if (broadcaster.isAdvertising()) {
        await broadcaster.stop();
      }
    });

    it('should start advertising service', async () => {
      await broadcaster.start();
      expect(broadcaster.isAdvertising()).toBe(true);
    });

    it('should stop advertising service', async () => {
      await broadcaster.start();
      await broadcaster.stop();
      expect(broadcaster.isAdvertising()).toBe(false);
    });

    it('should not start twice', async () => {
      await broadcaster.start();
      await broadcaster.start(); // Second start should be no-op
      expect(broadcaster.isAdvertising()).toBe(true);
    });

    it('should include peer metadata in service info', async () => {
      await broadcaster.start();
      const info = broadcaster.getServiceInfo();

      expect(info.name).toBe('Test Device');
      expect(info.type).toBe('_sc._tcp');
      expect(info.domain).toBe('local.');
      expect(info.port).toBe(8080);
    });

    it('should create TXT record with capabilities', async () => {
      await broadcaster.start();
      const info = broadcaster.getServiceInfo();
      const txt = info.txtRecord;

      expect(txt.version).toBe('1.0.0');
      expect(txt.peerId).toBe('test-peer-123');
      expect(txt.publicKey).toBe('dGVzdC1wdWJsaWMta2V5');
      expect(txt.webrtc).toBe('1');
      expect(txt.ble).toBe('0');
      expect(txt.file).toBe('1');
      expect(txt.voice).toBe('1');
      expect(txt.video).toBe('0');
      expect(txt.txtvers).toBe('1');
    });

    it('should include max file size in TXT record if provided', () => {
      const broadcasterWithFileSize = new MDNSBroadcaster({
        serviceName: 'Test Device',
        serviceType: '_sc._tcp',
        domain: 'local.',
        port: 8080,
        capabilities: {
          ...testCapabilities,
          maxFileSize: 10485760, // 10 MB
        },
      });

      const info = broadcasterWithFileSize.getServiceInfo();
      expect(info.txtRecord.maxFileSize).toBe('10485760');
    });

    it('should use default values for optional parameters', () => {
      const minimalBroadcaster = new MDNSBroadcaster({
        serviceName: 'Minimal',
        port: 9000,
        capabilities: testCapabilities,
      } as any);

      const info = minimalBroadcaster.getServiceInfo();
      expect(info.type).toBe('_sc._tcp');
      expect(info.domain).toBe('local.');
    });
  });

  describe('MDNSDiscoverer', () => {
    let discoverer: MDNSDiscoverer;

    beforeEach(() => {
      discoverer = new MDNSDiscoverer('_sc._tcp', {
        domain: 'local.',
        timeout: 5000,
      });
    });

    afterEach(async () => {
      if (discoverer.isScanning()) {
        await discoverer.stop();
      }
    });

    it('should start scanning for services', async () => {
      await discoverer.start();
      expect(discoverer.isScanning()).toBe(true);
    });

    it('should stop scanning', async () => {
      await discoverer.start();
      await discoverer.stop();
      expect(discoverer.isScanning()).toBe(false);
    });

    it('should discover peers on local network', async () => {
      const peerFoundPromise = new Promise<MDNSServiceInfo>((resolve) => {
        discoverer.on('peer-found', (peer) => resolve(peer));
      });

      await discoverer.start();

      // Simulate discovery
      const testService: MDNSServiceInfo = {
        name: 'Peer Device',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'peer-device.local.',
        port: 8080,
        txtRecord: {
          version: '1.0.0',
          peerId: 'peer-123',
          publicKey: 'cGVlci1wdWJsaWMta2V5',
          webrtc: '1',
          ble: '0',
          file: '1',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: ['192.168.1.100'],
      };

      discoverer.handleServiceFound(testService);

      const foundPeer = await peerFoundPromise;
      expect(foundPeer.name).toBe('Peer Device');
      expect(foundPeer.txtRecord.peerId).toBe('peer-123');
    });

    it('should update peer list on discovery', async () => {
      await discoverer.start();

      const testService: MDNSServiceInfo = {
        name: 'Peer Device',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'peer-device.local.',
        port: 8080,
        txtRecord: {
          peerId: 'peer-123',
          version: '1.0.0',
          publicKey: 'test',
          webrtc: '1',
          ble: '0',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: ['192.168.1.100'],
      };

      discoverer.handleServiceFound(testService);

      const peers = discoverer.getPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].name).toBe('Peer Device');
    });

    it('should emit peer-updated event when service changes', async () => {
      const updatedPromise = new Promise<MDNSServiceInfo>((resolve) => {
        discoverer.on('peer-updated', (peer) => resolve(peer));
      });

      await discoverer.start();

      const testService: MDNSServiceInfo = {
        name: 'Peer Device',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'peer-device.local.',
        port: 8080,
        txtRecord: {
          peerId: 'peer-123',
          version: '1.0.0',
          publicKey: 'test',
          webrtc: '1',
          ble: '0',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: ['192.168.1.100'],
      };

      // First discovery
      discoverer.handleServiceFound(testService);

      // Update
      const updatedService = { ...testService, port: 9000 };
      discoverer.handleServiceFound(updatedService);

      const updated = await updatedPromise;
      expect(updated.port).toBe(9000);
    });

    it('should emit peer-lost event when service disappears', async () => {
      const lostPromise = new Promise<MDNSServiceInfo>((resolve) => {
        discoverer.on('peer-lost', (peer) => resolve(peer));
      });

      await discoverer.start();

      const testService: MDNSServiceInfo = {
        name: 'Peer Device',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'peer-device.local.',
        port: 8080,
        txtRecord: {
          peerId: 'peer-123',
          version: '1.0.0',
          publicKey: 'test',
          webrtc: '1',
          ble: '0',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: ['192.168.1.100'],
      };

      discoverer.handleServiceFound(testService);
      discoverer.handleServiceLost('peer-123');

      const lost = await lostPromise;
      expect(lost.txtRecord.peerId).toBe('peer-123');
    });

    it('should filter discovered services', async () => {
      const filteredDiscoverer = new MDNSDiscoverer('_sc._tcp', {
        filter: (service) => service.txtRecord.webrtc === '1',
      });

      await filteredDiscoverer.start();

      // Service with WebRTC support
      const serviceWithWebRTC: MDNSServiceInfo = {
        name: 'WebRTC Peer',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'webrtc-peer.local.',
        port: 8080,
        txtRecord: {
          peerId: 'peer-1',
          webrtc: '1',
          version: '1.0.0',
          publicKey: 'test',
          ble: '0',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: [],
      };

      // Service without WebRTC support
      const serviceWithoutWebRTC: MDNSServiceInfo = {
        name: 'BLE Peer',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'ble-peer.local.',
        port: 8080,
        txtRecord: {
          peerId: 'peer-2',
          webrtc: '0',
          version: '1.0.0',
          publicKey: 'test',
          ble: '1',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: [],
      };

      filteredDiscoverer.handleServiceFound(serviceWithWebRTC);
      filteredDiscoverer.handleServiceFound(serviceWithoutWebRTC);

      const peers = filteredDiscoverer.getPeers();
      expect(peers).toHaveLength(1);
      expect(peers[0].name).toBe('WebRTC Peer');

      await filteredDiscoverer.stop();
    });

    it('should get specific peer by ID', async () => {
      await discoverer.start();

      const testService: MDNSServiceInfo = {
        name: 'Peer Device',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'peer-device.local.',
        port: 8080,
        txtRecord: {
          peerId: 'peer-123',
          version: '1.0.0',
          publicKey: 'test',
          webrtc: '1',
          ble: '0',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: [],
      };

      discoverer.handleServiceFound(testService);

      const peer = discoverer.getPeer('peer-123');
      expect(peer).not.toBeNull();
      expect(peer?.name).toBe('Peer Device');

      const nonexistent = discoverer.getPeer('nonexistent');
      expect(nonexistent).toBeNull();
    });

    it('should parse TXT record to capabilities', () => {
      const txtRecord = {
        version: '1.0.0',
        peerId: 'test-peer',
        publicKey: 'dGVzdC1rZXk=',
        webrtc: '1',
        ble: '0',
        file: '1',
        voice: '1',
        video: '0',
        maxFileSize: '5242880',
        txtvers: '1',
      };

      const caps = MDNSDiscoverer.parseTXTRecord(txtRecord);
      expect(caps).not.toBeNull();
      expect(caps?.version).toBe('1.0.0');
      expect(caps?.peerId).toBe('test-peer');
      expect(caps?.supportsWebRTC).toBe(true);
      expect(caps?.supportsBLE).toBe(false);
      expect(caps?.supportsFileTransfer).toBe(true);
      expect(caps?.maxFileSize).toBe(5242880);
    });
  });

  describe('Utility Functions', () => {
    it('should create service type string', () => {
      expect(createServiceType('tcp')).toBe('_sc._tcp');
      expect(createServiceType('udp')).toBe('_sc._udp');
      expect(createServiceType()).toBe('_sc._tcp'); // default
    });

    it('should validate service name', () => {
      expect(validateServiceName('Valid Name')).toBe(true);
      expect(validateServiceName('Device-123')).toBe(true);
      expect(validateServiceName('')).toBe(false);
      expect(validateServiceName('A'.repeat(64))).toBe(false); // Too long
      expect(validateServiceName('Invalid<Name>')).toBe(false);
      expect(validateServiceName('Invalid"Name')).toBe(false);
    });

    it('should format service instance name', () => {
      const formatted = formatServiceInstanceName(
        'My Device',
        '_sc._tcp',
        'local.'
      );
      expect(formatted).toBe('My Device._sc._tcp.local.');
    });
  });

  describe('Performance', () => {
    it('should handle discovery within 5 seconds', async () => {
      const discoverer = new MDNSDiscoverer('_sc._tcp', { timeout: 5000 });
      
      const startTime = Date.now();
      await discoverer.start();

      // Simulate immediate discovery
      const testService: MDNSServiceInfo = {
        name: 'Fast Peer',
        type: '_sc._tcp',
        domain: 'local.',
        host: 'fast-peer.local.',
        port: 8080,
        txtRecord: {
          peerId: 'fast-peer',
          version: '1.0.0',
          publicKey: 'test',
          webrtc: '1',
          ble: '0',
          file: '0',
          voice: '0',
          video: '0',
          txtvers: '1',
        },
        addresses: [],
      };

      discoverer.handleServiceFound(testService);
      const discoveryTime = Date.now() - startTime;

      expect(discoveryTime).toBeLessThan(5000);
      expect(discoverer.getPeers()).toHaveLength(1);

      await discoverer.stop();
    });
  });
});
