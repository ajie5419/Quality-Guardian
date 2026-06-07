import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetadata, setMetadata } from '~/modules/system/metadata';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    system_settings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('system metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns parsed metadata value when setting exists', async () => {
    (prisma.system_settings.findUnique as any).mockResolvedValueOnce({
      value: JSON.stringify({ syncedAt: '2026-06-06' }),
    });

    const value = await getMetadata('qms:metadata', { syncedAt: '' });

    expect(value).toEqual({ syncedAt: '2026-06-06' });
    expect(prisma.system_settings.findUnique).toHaveBeenCalledWith({
      where: { key: 'qms:metadata' },
    });
  });

  it('returns default value when setting is missing, empty, or invalid', async () => {
    (prisma.system_settings.findUnique as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ value: '' })
      .mockResolvedValueOnce({ value: '{bad json' });

    await expect(getMetadata('missing', ['default'])).resolves.toEqual([
      'default',
    ]);
    await expect(getMetadata('empty', 1)).resolves.toBe(1);
    await expect(getMetadata('invalid', { ok: false })).resolves.toEqual({
      ok: false,
    });

    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('upserts serialized metadata and swallows persistence errors', async () => {
    await setMetadata('qms:metadata', { syncedAt: '2026-06-06' });

    expect(prisma.system_settings.upsert).toHaveBeenCalledWith({
      where: { key: 'qms:metadata' },
      update: {
        value: JSON.stringify({ syncedAt: '2026-06-06' }),
        updatedAt: expect.any(Date),
      },
      create: {
        key: 'qms:metadata',
        value: JSON.stringify({ syncedAt: '2026-06-06' }),
        updatedAt: expect.any(Date),
        description: 'Store persistent metadata for mock logic',
      },
    });

    (prisma.system_settings.upsert as any).mockRejectedValueOnce(
      new Error('write failed'),
    );

    await expect(
      setMetadata('qms:metadata', { ok: true }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
