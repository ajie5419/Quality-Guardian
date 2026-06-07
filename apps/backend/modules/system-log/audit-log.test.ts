import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { logApiError } from '~/utils/api-logger';

const getHeader = vi.hoisted(() => vi.fn());

vi.mock('h3', () => ({
  getHeader,
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    recordAuditLog: vi.fn(),
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

function createEvent(remoteAddress = '10.0.0.3') {
  return {
    node: {
      req: {
        socket: {
          remoteAddress,
        },
      },
    },
  };
}

describe('recordBusinessAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips audit logging when user id is missing', async () => {
    await recordBusinessAuditLog(createEvent() as any, {
      action: 'CREATE',
      detailsTemplate: 'Created {number}',
      detailsVariables: { number: 'WO-1' },
      targetId: 'WO-1',
      targetType: 'work_order',
    });

    expect(SystemLogService.recordAuditLog).not.toHaveBeenCalled();
  });

  it('records audit log with forwarded IP and user agent', async () => {
    getHeader.mockImplementation((_event, key: string) => {
      if (key === 'x-forwarded-for') return '10.0.0.1, 10.0.0.2';
      if (key === 'user-agent') return 'Browser UA';
      return undefined;
    });

    await recordBusinessAuditLog(createEvent() as any, {
      action: 'UPDATE',
      detailsTemplate: 'Updated {number}',
      detailsVariables: { number: 'AS-001' },
      targetId: 'AS-001',
      targetType: 'after_sales',
      userId: 1001,
    });

    expect(SystemLogService.recordAuditLog).toHaveBeenCalledWith({
      action: 'UPDATE',
      detailsTemplate: 'Updated {number}',
      detailsVariables: { number: 'AS-001' },
      ipAddress: '10.0.0.1',
      targetId: 'AS-001',
      targetType: 'after_sales',
      userAgent: 'Browser UA',
      userId: '1001',
    });
  });

  it('falls back to real IP, socket IP, and unknown user agent', async () => {
    getHeader.mockImplementation((_event, key: string) => {
      if (key === 'x-real-ip') return '10.0.0.9';
      return undefined;
    });

    await recordBusinessAuditLog(createEvent('10.0.0.3') as any, {
      action: 'DELETE',
      detailsTemplate: 'Deleted {number}',
      detailsVariables: { number: 'AS-001' },
      targetId: 'AS-001',
      targetType: 'after_sales',
      userId: 'user-1',
    });

    expect(SystemLogService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '10.0.0.9',
        userAgent: 'Unknown',
      }),
    );
  });

  it('logs audit persistence errors without rethrowing', async () => {
    const error = new Error('write failed');
    (SystemLogService.recordAuditLog as any).mockRejectedValueOnce(error);

    await expect(
      recordBusinessAuditLog(createEvent() as any, {
        action: 'EXPORT',
        detailsTemplate: 'Exported {number}',
        detailsVariables: { number: 'AS-001' },
        targetId: 'AS-001',
        targetType: 'after_sales',
        userId: 'user-1',
      }),
    ).resolves.toBeUndefined();

    expect(logApiError).toHaveBeenCalledWith('audit-log', error);
  });
});
