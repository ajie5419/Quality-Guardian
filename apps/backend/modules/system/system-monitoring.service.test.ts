import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemMonitoringService } from '~/modules/system/system-monitoring.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

describe('systemMonitoringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDatabaseMetrics', () => {
    it('should return healthy metrics with correct values', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([
          { Variable_name: 'Threads_connected', Value: '10' },
          { Variable_name: 'Threads_running', Value: '3' },
          { Variable_name: 'Max_used_connections', Value: '20' },
          { Variable_name: 'Questions', Value: '5000' },
          { Variable_name: 'Innodb_buffer_pool_read_requests', Value: '10000' },
          { Variable_name: 'Innodb_buffer_pool_reads', Value: '100' },
          { Variable_name: 'Com_commit', Value: '800' },
          { Variable_name: 'Com_rollback', Value: '20' },
          { Variable_name: 'Handler_write', Value: '500' },
          { Variable_name: 'Handler_update', Value: '300' },
          { Variable_name: 'Handler_delete', Value: '100' },
          { Variable_name: 'Handler_read_first', Value: '200' },
          { Variable_name: 'Handler_read_key', Value: '1000' },
          { Variable_name: 'Handler_read_next', Value: '400' },
          { Variable_name: 'Handler_read_prev', Value: '50' },
          { Variable_name: 'Innodb_buffer_pool_pages_total', Value: '1000' },
          { Variable_name: 'Innodb_buffer_pool_pages_free', Value: '200' },
          { Variable_name: 'Innodb_page_size', Value: '16384' },
        ])
        .mockResolvedValueOnce([{ version: '8.0.35' }])
        .mockResolvedValueOnce([{ Value: '100000' }])
        .mockResolvedValueOnce([{ size: '2097152' }])
        .mockResolvedValueOnce([
          { Variable_name: 'character_set_database', Value: 'utf8mb4' },
          { Variable_name: 'time_zone', Value: 'Asia/Shanghai' },
        ]);

      const result = await SystemMonitoringService.getDatabaseMetrics();

      expect(result.status).toBe('Healthy');
      expect(result.version).toBe('8.0.35');
      expect(result.uptime).toBe(100_000);
      expect(result.size).toBe(2_097_152);
      expect(result.activeConnections).toBe(10);
      expect(result.threadsRunning).toBe(3);
      expect(result.maxConnections).toBe(20);
      expect(result.totalQueries).toBe(5000);
      expect(result.charset).toBe('utf8mb4');
      expect(result.timezone).toBe('Asia/Shanghai');
      expect(result.cacheHitRate).toBe(99);
      expect(result.commitRate).toBe(97.56);
      expect(result.idleConnections).toBe(7);
    });

    it('should return unhealthy metrics on database error', async () => {
      (prisma.$queryRaw as any).mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await SystemMonitoringService.getDatabaseMetrics();

      expect(result.status).toBe('Unhealthy');
      expect(result.error).toBe('Connection refused');
      expect(result.latency).toBe(-1);
    });

    it('should handle zero buffer pool read requests', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([
          { Variable_name: 'Threads_connected', Value: '5' },
          { Variable_name: 'Threads_running', Value: '1' },
          { Variable_name: 'Innodb_buffer_pool_read_requests', Value: '0' },
          { Variable_name: 'Innodb_buffer_pool_reads', Value: '0' },
          { Variable_name: 'Com_commit', Value: '0' },
          { Variable_name: 'Com_rollback', Value: '0' },
          { Variable_name: 'Innodb_buffer_pool_pages_total', Value: '0' },
          { Variable_name: 'Innodb_buffer_pool_pages_free', Value: '0' },
          { Variable_name: 'Innodb_page_size', Value: '16384' },
        ])
        .mockResolvedValueOnce([{ version: '8.0.35' }])
        .mockResolvedValueOnce([{ Value: '0' }])
        .mockResolvedValueOnce([{ size: '0' }])
        .mockResolvedValueOnce([]);

      const result = await SystemMonitoringService.getDatabaseMetrics();

      expect(result.cacheHitRate).toBe(100);
      expect(result.commitRate).toBe(100);
      expect(result.resource.cpuUsage).toBe(50);
    });

    it('should cap CPU usage at 99.9 when threads exceed cores', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([
          { Variable_name: 'Threads_connected', Value: '100' },
          { Variable_name: 'Threads_running', Value: '10' },
          { Variable_name: 'Innodb_buffer_pool_pages_total', Value: '0' },
          { Variable_name: 'Innodb_buffer_pool_pages_free', Value: '0' },
          { Variable_name: 'Innodb_page_size', Value: '16384' },
        ])
        .mockResolvedValueOnce([{ version: '8.0.35' }])
        .mockResolvedValueOnce([{ Value: '0' }])
        .mockResolvedValueOnce([{ size: '0' }])
        .mockResolvedValueOnce([]);

      const result = await SystemMonitoringService.getDatabaseMetrics();

      expect(result.resource.cpuUsage).toBe(99.9);
    });
  });
});
