import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/report/vehicle-failure-rate-manual.post.service';
import prisma from '~/utils/prisma';

vi.mock('h3', () => ({
  defineEventHandler: (fn: (event: any) => any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    system_settings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/utils/current-user', () => ({
  getCurrentUser: vi.fn().mockReturnValue({ username: 'admin' }),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      _error: true,
      message: msg,
    })),
  internalServerErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      _error: true,
      message: msg,
    })),
  useResponseSuccess: vi.fn().mockImplementation((data: unknown) => ({
    _success: true,
    data,
  })),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

describe('vehicleFailureRateManualPostService handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createEvent = (_body: Record<string, unknown>) =>
    ({ node: { req: {}, res: {} } }) as any;

  it('returns bad request for invalid month format', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ count: 5, month: 'invalid' });

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns bad request when neither count nor warrantyVehicleCount is provided', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ month: '2026-01' });

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns bad request for negative count', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ count: -5, month: '2026-01' });

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns bad request for non-integer count', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ count: 3.5, month: '2026-01' });

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('returns bad request for negative warrantyVehicleCount', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({
      month: '2026-01',
      warrantyVehicleCount: -1,
    });

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('saves count to system_settings', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ count: 10, month: '2026-03' });
    (prisma.system_settings.findUnique as any).mockResolvedValue({
      key: 'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL',
      value: JSON.stringify({ '2026-02': 5 }),
    });
    (prisma.system_settings.upsert as any).mockResolvedValue({});

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _success: true }));
    expect(prisma.system_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL' },
      }),
    );
  });

  it('saves warrantyVehicleCount to system_settings', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({
      month: '2026-05',
      warrantyVehicleCount: 200,
    });
    (prisma.system_settings.findUnique as any).mockResolvedValue(null);
    (prisma.system_settings.upsert as any).mockResolvedValue({});

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _success: true }));
    expect(prisma.system_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key: 'QMS_VEHICLE_FAILURE_LAST_YEAR_WARRANTY_MONTHLY_MANUAL',
        },
      }),
    );
  });

  it('saves both count and warrantyVehicleCount when both provided', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({
      count: 7,
      month: '2026-04',
      warrantyVehicleCount: 150,
    });
    (prisma.system_settings.findUnique as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    (prisma.system_settings.upsert as any).mockResolvedValue({});

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _success: true }));
    expect(prisma.system_settings.upsert).toHaveBeenCalledTimes(2);
  });

  it('rejects month with year-month format but invalid month number', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ count: 5, month: '2026-13' });

    const result = await handler(createEvent({}));

    expect(result).toEqual(expect.objectContaining({ _error: true }));
  });

  it('merges count with existing manual data', async () => {
    const { readBody } = await import('h3');
    vi.mocked(readBody).mockResolvedValue({ count: 20, month: '2026-01' });
    (prisma.system_settings.findUnique as any).mockResolvedValue({
      value: JSON.stringify({ '2026-01': 10, '2025-12': 8 }),
    });
    (prisma.system_settings.upsert as any).mockResolvedValue({});

    await handler(createEvent({}));

    expect(prisma.system_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'QMS_VEHICLE_FAILURE_LAST_YEAR_MANUAL' },
        update: expect.objectContaining({
          value: JSON.stringify({ '2026-01': 20, '2025-12': 8 }),
        }),
      }),
    );
  });
});
