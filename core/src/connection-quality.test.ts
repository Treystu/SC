import { 
  calculateConnectionQuality, 
  ConnectionMonitor, 
  ConnectionMetrics 
} from './connection-quality';

describe('Connection Quality', () => {
  describe('calculateConnectionQuality', () => {
    it('should return offline if latency is Infinity', () => {
      const metrics: ConnectionMetrics = {
        latency: Infinity,
        packetLoss: 0,
        bandwidth: 0,
        jitter: 0
      };
      expect(calculateConnectionQuality(metrics)).toBe('offline');
    });

    it('should return excellent for low latency and packet loss', () => {
      const metrics: ConnectionMetrics = {
        latency: 40,
        packetLoss: 0.5,
        bandwidth: 1000,
        jitter: 5
      };
      expect(calculateConnectionQuality(metrics)).toBe('excellent');
    });

    it('should return good for moderate latency and packet loss', () => {
      const metrics: ConnectionMetrics = {
        latency: 80,
        packetLoss: 2,
        bandwidth: 1000,
        jitter: 10
      };
      expect(calculateConnectionQuality(metrics)).toBe('good');
    });

    it('should return fair for higher latency and packet loss', () => {
      const metrics: ConnectionMetrics = {
        latency: 150,
        packetLoss: 8,
        bandwidth: 1000,
        jitter: 20
      };
      expect(calculateConnectionQuality(metrics)).toBe('fair');
    });

    it('should return poor for high latency', () => {
      const metrics: ConnectionMetrics = {
        latency: 300,
        packetLoss: 0,
        bandwidth: 1000,
        jitter: 5
      };
      expect(calculateConnectionQuality(metrics)).toBe('poor');
    });

    it('should return poor for high packet loss', () => {
      const metrics: ConnectionMetrics = {
        latency: 40,
        packetLoss: 15,
        bandwidth: 1000,
        jitter: 5
      };
      expect(calculateConnectionQuality(metrics)).toBe('poor');
    });
  });

  describe('ConnectionMonitor', () => {
    let monitor: ConnectionMonitor;

    beforeEach(() => {
      monitor = new ConnectionMonitor();
    });

    it('should initialize with default metrics', () => {
      const metrics = monitor.getMetrics();
      expect(metrics.latency).toBe(Infinity);
      expect(metrics.packetLoss).toBe(0);
      expect(metrics.bandwidth).toBe(0);
      expect(metrics.jitter).toBe(0);
    });

    it('should update latency and calculate average', () => {
      monitor.updateLatency(100);
      expect(monitor.getMetrics().latency).toBe(100);

      monitor.updateLatency(200);
      expect(monitor.getMetrics().latency).toBe(150); // (100 + 200) / 2
    });

    it('should calculate jitter', () => {
      monitor.updateLatency(100);
      monitor.updateLatency(110);
      // diff is 10, jitter is 10
      expect(monitor.getMetrics().jitter).toBe(10);

      monitor.updateLatency(100);
      // diffs: 10, 10. jitter: 10
      expect(monitor.getMetrics().jitter).toBe(10);
    });

    it('should update packet loss', () => {
      monitor.updatePacketLoss(100, 95);
      expect(monitor.getMetrics().packetLoss).toBe(5); // 5% loss
    });

    it('should update bandwidth', () => {
      monitor.updateBandwidth(1000, 1000); // 1000 bytes in 1000ms
      expect(monitor.getMetrics().bandwidth).toBe(1000); // 1000 bytes/sec
    });

    it('should return correct quality based on metrics', () => {
      expect(monitor.getQuality()).toBe('offline');

      monitor.updateLatency(40);
      monitor.updatePacketLoss(100, 100); // 0% loss
      expect(monitor.getQuality()).toBe('excellent');
    });
  });
});