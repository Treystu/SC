import { BackupManager } from '../../core/src/backup/backup';
import { RestoreManager } from '../../core/src/backup/restore';
import { MemoryStorageAdapter } from '../../core/src/storage/memory';

describe('Backup and Restore Integration Test', () => {
  it('should backup and restore data', async () => {
    const storage = new MemoryStorageAdapter();
    await storage.set('key1', 'value1');
    await storage.set('key2', 'value2');

    const backupManager = new BackupManager(storage);
    const backup = await backupManager.createBackup();

    await storage.clear();
    expect(await storage.get('key1')).toBeUndefined();

    const restoreManager = new RestoreManager(storage);
    await restoreManager.restoreBackup(backup);

    expect(await storage.get('key1')).toBe('value1');
    expect(await storage.get('key2')).toBe('value2');
  });
});