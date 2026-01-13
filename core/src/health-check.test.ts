import { HealthChecker } from './health-check';

describe('HealthChecker', () => {
  it('should perform a health check and return a healthy result', async () => {
    const healthChecker = new HealthChecker();
    const result = await healthChecker.performHealthCheck();
    
    // Check that we get a result with all required fields
    expect(result).toHaveProperty('healthy');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('checks');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('uptime');
    
    // Check that all checks are present
    expect(result.checks).toHaveProperty('crypto');
    expect(result.checks).toHaveProperty('storage');
    expect(result.checks).toHaveProperty('network');
    expect(result.checks).toHaveProperty('performance');
    
    // Status should be one of the valid values
    expect(['healthy', 'degraded', 'critical']).toContain(result.status);
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