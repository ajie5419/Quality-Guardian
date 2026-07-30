import { exec } from 'node:child_process';
import os from 'node:os';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemService } from '~/modules/system/system.service';
import prisma from '~/utils/prisma';

// Mock os, child_process and prisma
vi.mock('os', () => {
  const osMock = {
    networkInterfaces: vi.fn(),
    totalmem: vi.fn(),
    freemem: vi.fn(),
    uptime: vi.fn(),
    cpus: vi.fn(),
    platform: vi.fn(),
    release: vi.fn(),
    arch: vi.fn(),
    hostname: vi.fn(),
    loadavg: vi.fn(),
  };
  return {
    ...osMock,
    default: osMock,
  };
});

vi.mock('node:child_process', () => {
  const exec = vi.fn();
  const promisifyCustom = Symbol.for('nodejs.util.promisify.custom');
  (exec as any)[promisifyCustom] = (cmd: string) =>
    new Promise((resolve, reject) => {
      exec(cmd, (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stderr, stdout });
      });
    });
  return {
    exec,
    default: {
      exec,
    },
  };
});

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    system_settings: {
      findUnique: vi.fn(),
    },
  },
}));

describe('systemService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default os mocks
    (os.platform as any).mockReturnValue('darwin');
    (os.totalmem as any).mockReturnValue(16 * 1024 * 1024 * 1024);
    (os.freemem as any).mockReturnValue(8 * 1024 * 1024 * 1024);
    (os.uptime as any).mockReturnValue(3600);
    (os.cpus as any).mockReturnValue([
      { model: 'M1', times: { user: 10, nice: 0, sys: 5, idle: 85, irq: 0 } },
    ]);
    (os.networkInterfaces as any).mockReturnValue({
      en0: [{ family: 'IPv4', address: '192.168.1.1', internal: false }],
    });
    (os.loadavg as any).mockReturnValue([1.5, 1.2, 1]);
  });

  describe('getServerMetrics', () => {
    it('should correctly aggregate server metrics on Darwin', async () => {
      (exec as any).mockImplementation(
        (cmd: string, optionsOrCallback: any, maybeCallback?: any) => {
          const callback =
            typeof optionsOrCallback === 'function'
              ? optionsOrCallback
              : maybeCallback;
          let stdout = '';
          if (cmd === 'vm_stat') {
            stdout =
              'Pages active: 100\nPages inactive: 50\nPages purgeable: 10\nPages wired down: 20\nMach system calls: 1000\nMach traps: 500\ndevice interrupts: 200';
          }
          if (cmd === 'df -kP') {
            stdout =
              'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s1 488245288 245288 488000000 1% /';
          }
          if (cmd === 'netstat -ib') {
            stdout =
              'Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\nen0 1500 <Link#4> 00:00:00:00:00:01 100 0 1000 50 0 500 0';
          }
          if (cmd.startsWith('ps')) {
            stdout =
              'PID %CPU %MEM STAT COMM\n1 0.1 0.2 S launchd\n100 5.0 1.5 R node';
          }
          if (cmd === 'sysctl -n hw.cpufrequency') {
            stdout = '3200000000';
          }
          queueMicrotask(() => {
            callback(null, stdout, '');
          });
          return {};
        },
      );

      const metrics = await SystemService.getServerMetrics();

      expect(metrics.os.platform).toBe('darwin');
      expect(metrics.os.ip).toBe('192.168.1.1');
      expect(metrics.cpu.model).toBe('M1');
      expect(metrics.memory.total).toBe(16 * 1024 * 1024 * 1024);
      expect(metrics.disk.mounts).toHaveLength(1);
      expect(metrics.processes.list).toHaveLength(2);
      expect(metrics.processes.running).toBe(1);
    });
  });

  describe('getDatabaseMetrics', () => {
    it('should correctly aggregate database metrics', async () => {
      (prisma.$queryRaw as any)
        .mockResolvedValueOnce([
          { Variable_name: 'Threads_connected', Value: '10' },
          { Variable_name: 'Threads_running', Value: '2' },
          {
            Variable_name: 'Innodb_buffer_pool_read_pages_total',
            Value: '1000',
          },
          { Variable_name: 'Innodb_buffer_pool_pages_total', Value: '1000' },
          { Variable_name: 'Innodb_buffer_pool_pages_free', Value: '200' },
          { Variable_name: 'Innodb_page_size', Value: '16384' },
        ]) // Global Status
        .mockResolvedValueOnce([{ version: '8.0.28' }]) // Version
        .mockResolvedValueOnce([{ Value: '100000' }]) // Uptime
        .mockResolvedValueOnce([{ size: '1048576' }]) // Size
        .mockResolvedValueOnce([
          { Variable_name: 'character_set_database', Value: 'utf8mb4' },
          { Variable_name: 'time_zone', Value: '+00:00' },
        ]); // Variables

      const metrics = await SystemService.getDatabaseMetrics();

      expect(metrics.status).toBe('Healthy');
      expect(metrics.version).toBe('8.0.28');
      expect(metrics.activeConnections).toBe(10);
      expect(metrics.resource.ramTotal).toBe(2 * 1024 * 1024 * 1024);
      expect(metrics.charset).toBe('utf8mb4');
    });

    it('should handle database errors gracefully', async () => {
      (prisma.$queryRaw as any).mockRejectedValue(new Error('DB Error'));

      const metrics = await SystemService.getDatabaseMetrics();

      expect(metrics.status).toBe('Unhealthy');
      expect(metrics.error).toBe('DB Error');
      expect(metrics.latency).toBe(-1);
    });
  });

  describe('isInspectionManualCreateEnabled', () => {
    it('returns true when the setting has never been saved', async () => {
      (prisma.system_settings.findUnique as any).mockResolvedValue(null);

      await expect(
        SystemService.isInspectionManualCreateEnabled(),
      ).resolves.toBe(true);
    });

    it('returns true when the setting is explicitly "true"', async () => {
      (prisma.system_settings.findUnique as any).mockResolvedValue({
        value: 'true',
      });

      await expect(
        SystemService.isInspectionManualCreateEnabled(),
      ).resolves.toBe(true);
    });

    it('returns false when the setting is explicitly "false"', async () => {
      (prisma.system_settings.findUnique as any).mockResolvedValue({
        value: 'false',
      });

      await expect(
        SystemService.isInspectionManualCreateEnabled(),
      ).resolves.toBe(false);
    });
  });

  describe('isIncomingMaterialFreeInputEnabled', () => {
    it('defaults to false and only enables on an explicit true value', async () => {
      (prisma.system_settings.findUnique as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ value: 'true' });

      await expect(
        SystemService.isIncomingMaterialFreeInputEnabled(),
      ).resolves.toBe(false);
      await expect(
        SystemService.isIncomingMaterialFreeInputEnabled(),
      ).resolves.toBe(true);
    });
  });
});
