import { LoginStatusEnum } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { SystemLogService } from '../system-log.service';

vi.mock('../../utils/prisma', () => ({
  default: {
    login_logs: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('systemLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordLogin', () => {
    it('should record a successful login log', async () => {
      const params = {
        ip: '127.0.0.1',
        status: LoginStatusEnum.SUCCESS,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        username: 'admin',
      };

      await SystemLogService.recordLogin(params);

      expect(prisma.login_logs.create).toHaveBeenCalledWith({
        data: {
          username: 'admin',
          ip: '127.0.0.1',
          browser: 'Chrome',
          os: 'Mac OS X',
          device: '桌面设备',
          status: LoginStatusEnum.SUCCESS,
          message: '登录成功',
          method: '密码登录',
        },
      });
    });

    it('should handle missing IP and user agent', async () => {
      const params = {
        status: LoginStatusEnum.FAIL,
        username: 'user',
        message: 'Invalid password',
      };

      await SystemLogService.recordLogin(params);

      expect(prisma.login_logs.create).toHaveBeenCalledWith({
        data: {
          username: 'user',
          ip: 'Unknown',
          browser: 'Unknown',
          os: 'Unknown',
          device: '桌面设备',
          status: '失败',
          message: 'Invalid password',
          method: '密码登录',
        },
      });
    });
  });

  describe('getLoginLogs', () => {
    it('should get paginated logs with filters', async () => {
      const params = {
        page: 2,
        pageSize: 10,
        username: 'test',
        status: '成功',
        startDate: '2024-01-01',
        endDate: '2024-01-02',
      };

      (prisma.login_logs.findMany as any).mockResolvedValue([{ id: '1' }]);
      (prisma.login_logs.count as any).mockResolvedValue(100);

      const result = await SystemLogService.getLoginLogs(params);

      expect(prisma.login_logs.findMany).toHaveBeenCalledWith({
        where: {
          username: { contains: 'test' },
          status: '成功',
          createdAt: {
            gte: expect.any(Date),
            lte: expect.any(Date),
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
      expect(result.total).toBe(100);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('delete operations', () => {
    it('should delete a single log', async () => {
      await SystemLogService.deleteLog('123');
      expect(prisma.login_logs.delete).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should batch delete logs', async () => {
      await SystemLogService.batchDeleteLogs(['1', '2']);
      expect(prisma.login_logs.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['1', '2'] } },
      });
    });
  });
});
