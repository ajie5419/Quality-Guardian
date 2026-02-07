import { describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { SystemLogService } from '../system-log.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    audit_logs: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('systemLogService - Audit Logs', () => {
  it('should get paginated audit logs with filters', async () => {
    const mockItems = [
      {
        id: '1',
        action: 'DELETE',
        targetType: 'after_sales',
        targetId: 'AS-001',
        userId: 'user-1',
        users: { username: 'admin', realName: 'Administrator' },
        createdAt: new Date(),
      },
    ];

    (prisma.audit_logs.findMany as any).mockResolvedValue(mockItems);
    (prisma.audit_logs.count as any).mockResolvedValue(1);

    const result = await SystemLogService.getAuditLogs({
      page: 1,
      pageSize: 10,
      action: 'DELETE',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].username).toBe('Administrator');
    expect(result.total).toBe(1);
    expect(prisma.audit_logs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ action: 'DELETE' }),
        skip: 0,
        take: 10,
      }),
    );
  });

  it('should delete a single audit log', async () => {
    await SystemLogService.deleteAuditLog('1');
    expect(prisma.audit_logs.delete).toHaveBeenCalledWith({
      where: { id: '1' },
    });
  });

  it('should batch delete audit logs', async () => {
    const ids = ['1', '2'];
    (prisma.audit_logs.deleteMany as any).mockResolvedValue({ count: 2 });

    const result = await SystemLogService.batchDeleteAuditLogs(ids);
    expect(result.count).toBe(2);
    expect(prisma.audit_logs.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ids } },
    });
  });
});
