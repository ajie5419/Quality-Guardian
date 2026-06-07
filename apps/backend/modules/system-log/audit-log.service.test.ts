import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    audit_logs: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/module-loader', () => ({
  getAuditActionConfig: vi.fn((moduleName: string, actionKey: string) => {
    if (moduleName === 'after-sales' && actionKey === 'close') {
      return {
        action: 'UPDATE',
        detailsTemplate: 'Closed {{number}} by {{operator}}',
        targetType: 'after_sales',
      };
    }
    return null;
  }),
}));

describe('systemLogService - Audit Logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should record audit log with rendered template variables', async () => {
    (prisma.audit_logs.create as any).mockResolvedValue({
      id: 'audit-1',
    });

    const result = await SystemLogService.recordAuditLog({
      action: 'UPDATE' as any,
      detailsTemplate: 'Updated {{number}} to {{status}}',
      detailsVariables: {
        number: 'AS-001',
        status: 'Closed',
      },
      targetId: 'AS-001',
      targetType: 'after_sales',
      userId: 'user-1',
    });

    expect(result).toEqual({ id: 'audit-1' });
    expect(prisma.audit_logs.create).toHaveBeenCalledWith({
      data: {
        action: 'UPDATE',
        details: 'Updated AS-001 to Closed',
        ipAddress: 'Unknown',
        targetId: 'AS-001',
        targetType: 'after_sales',
        userAgent: 'Unknown',
        userId: 'user-1',
      },
    });
  });

  it('should record module-declared audit log and reject undeclared actions', async () => {
    (prisma.audit_logs.create as any).mockResolvedValue({
      id: 'audit-1',
    });

    await SystemLogService.auditLog('after-sales', 'close', {
      detailsVariables: {
        number: 'AS-001',
        operator: 'admin',
      },
      ipAddress: '127.0.0.1',
      targetId: 'AS-001',
      userAgent: 'UA',
      userId: 'user-1',
    });

    expect(prisma.audit_logs.create).toHaveBeenCalledWith({
      data: {
        action: 'UPDATE',
        details: 'Closed AS-001 by admin',
        ipAddress: '127.0.0.1',
        targetId: 'AS-001',
        targetType: 'after_sales',
        userAgent: 'UA',
        userId: 'user-1',
      },
    });

    await expect(
      SystemLogService.auditLog('after-sales', 'unknown', {
        detailsVariables: {},
        targetId: 'AS-001',
        userId: 'user-1',
      }),
    ).rejects.toThrow('Audit action is not declared: after-sales.unknown');
  });

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
        where: expect.objectContaining({
          action: 'DELETE',
          isDeleted: false,
        }),
        skip: 0,
        take: 10,
      }),
    );
  });

  it('should query audit logs by business target', async () => {
    (prisma.audit_logs.findMany as any).mockResolvedValueOnce([
      { id: 'audit-1' },
    ]);

    const result = await SystemLogService.getAuditLogsByTarget({
      targetId: 'AS-001',
      targetType: 'after_sales',
    });

    expect(result).toEqual([{ id: 'audit-1' }]);
    expect(prisma.audit_logs.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        targetId: 'AS-001',
        targetType: 'after_sales',
      },
      include: {
        users: {
          select: {
            realName: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should soft delete a single audit log', async () => {
    await SystemLogService.deleteAuditLog('1');
    expect(prisma.audit_logs.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: { isDeleted: true },
    });
  });

  it('should batch soft delete audit logs', async () => {
    const ids = ['1', '2'];
    (prisma.audit_logs.updateMany as any).mockResolvedValue({ count: 2 });

    const result = await SystemLogService.batchDeleteAuditLogs(ids);
    expect(result.count).toBe(2);
    expect(prisma.audit_logs.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
  });
});
