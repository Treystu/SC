import { PeerHealthMonitor } from '../health';
import { generateIdentity } from '../../crypto';

describe('PeerHealthMonitor', () => {
  let monitor: PeerHealthMonitor;

  beforeEach(() => {
    monitor = new PeerHealthMonitor(100, 2); // Short intervals for testing
  });

  afterEach(() => {
    monitor.destroy();
  });

  it('should mark peer as healthy after heartbeat', () => {
    const peerId = generateIdentity().publicKey;
    
    monitor.recordHeartbeat(peerId);
    expect(monitor.isHealthy(peerId)).toBe(true);
  });

  it('should mark peer as unhealthy after missed heartbeats', (done) => {
    const peerId = generateIdentity().publicKey;
    
    monitor.recordHeartbeat(peerId);
    expect(monitor.isHealthy(peerId)).toBe(true);

    // Wait for heartbeats to be missed
    setTimeout(() => {
      const unhealthy = monitor.getUnhealthyPeers();
      expect(unhealthy.length).toBeGreaterThan(0);
      done();
    }, 350); // Should miss 3 heartbeats
  });

  it('should remove peer from monitoring', () => {
    const peerId = generateIdentity().publicKey;
    
    monitor.recordHeartbeat(peerId);
    expect(monitor.isHealthy(peerId)).toBe(true);
    
    monitor.removePeer(peerId);
    expect(monitor.isHealthy(peerId)).toBe(false);
  });
});
