import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

const {
  badRequestResponse,
  internalServerErrorResponse,
  readBody,
  useResponseSuccess,
} = vi.hoisted(() => ({
  badRequestResponse: vi.fn((_event, message) => ({
    message,
    type: 'bad_request',
  })),
  internalServerErrorResponse: vi.fn((_event, message) => ({
    message,
    type: 'internal_server_error',
  })),
  readBody: vi.fn(),
  useResponseSuccess: vi.fn((data) => ({ data, type: 'success' })),
}));

vi.mock('h3', () => ({
  defineEventHandler: (handler: unknown) => handler,
  readBody,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    system_settings: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
}));

describe('dashboard targets post service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadHandler() {
    vi.resetModules();
    const mod = await import(
      '~/modules/dashboard/dashboard-targets.post.service'
    );
    return mod.default as (event: unknown) => Promise<unknown>;
  }

  it('saves valid process pass-rate targets', async () => {
    const handler = await loadHandler();
    const body = {
      外协结构: 99.8,
      机加BU: 99.9,
    };
    readBody.mockResolvedValueOnce(body);
    (prisma.system_settings.upsert as any).mockResolvedValueOnce({ id: 's1' });

    const result = await handler({ context: {} });

    expect(prisma.system_settings.upsert).toHaveBeenCalledWith({
      where: { key: 'QMS_PASS_RATE_TARGETS' },
      update: {
        value: JSON.stringify(body),
        updatedAt: expect.any(Date),
      },
      create: {
        description: 'QMS各工序目标合格率配置 (Quality Pass Rate Targets)',
        key: 'QMS_PASS_RATE_TARGETS',
        value: JSON.stringify(body),
      },
    });
    expect(useResponseSuccess).toHaveBeenCalledWith({
      success: true,
      targets: body,
    });
    expect(result).toEqual({
      data: { success: true, targets: body },
      type: 'success',
    });
  });

  it('rejects missing or non-object request body', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce(null);

    const result = await handler({ context: {} });

    expect(result).toEqual({
      message: 'Invalid request body',
      type: 'bad_request',
    });
    expect(prisma.system_settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects unsupported process target keys', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({ legacy: 99 });

    const result = await handler({ context: {} });

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Unsupported process key: legacy',
    );
    expect(result).toEqual({
      message: 'Unsupported process key: legacy',
      type: 'bad_request',
    });
    expect(prisma.system_settings.upsert).not.toHaveBeenCalled();
  });

  it('rejects target values outside the allowed range', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({ 外协结构: 101 });

    const result = await handler({ context: {} });

    expect(badRequestResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Invalid value for 外协结构: 101. Must be between 0 and 100.',
    );
    expect(result).toEqual({
      message: 'Invalid value for 外协结构: 101. Must be between 0 and 100.',
      type: 'bad_request',
    });
    expect(prisma.system_settings.upsert).not.toHaveBeenCalled();
  });

  it('returns internal error response when persistence fails', async () => {
    const handler = await loadHandler();
    readBody.mockResolvedValueOnce({ 外协结构: 99.8 });
    (prisma.system_settings.upsert as any).mockRejectedValueOnce(
      new Error('write failed'),
    );

    const result = await handler({ context: {} });

    expect(internalServerErrorResponse).toHaveBeenCalledWith(
      expect.anything(),
      'Failed to save quality targets: write failed',
    );
    expect(result).toEqual({
      message: 'Failed to save quality targets: write failed',
      type: 'internal_server_error',
    });
  });
});
