import { HealthChecker } from './health-check.js';

describe('HealthChecker', () => {
  it('should perform a health check and return a healthy result', async () => {
    const healthChecker = new HealthChecker();
    const result = await healthChecker.performHealthCheck();
    expect(result.healthy).toBe(true);
    expect(result.status).toBe('healthy');
  });

  it('should return cached results', async () => {
    const healthChecker = new HealthChecker();
    await healthChecker.performHealthCheck();
    const cached = healthChecker.getCachedResults();
    expect(cached.size).toBe(4);
  });

  it('should return uptime', async () => {
    const healthChecker = new HealthChecker();
    await new Promise(resolve => setTimeout(resolve, 100));
    const uptime = healthChecker.getUptime();
    expect(uptime).toBeGreaterThan(50);
  });
});