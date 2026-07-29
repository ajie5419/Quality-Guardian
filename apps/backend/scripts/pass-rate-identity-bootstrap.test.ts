import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { bootstrapPassRateIdentityBindings } from './pass-rate-identity-bootstrap';

vi.mock('~/utils/prisma', () => ({
  default: {
    dictionaries: { findMany: vi.fn() },
    processes: { findMany: vi.fn() },
    system_settings: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

describe('pass-rate identity bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.system_settings.upsert).mockResolvedValue({
      description: null,
      key: 'QMS_PASS_RATE_BUCKET_IDENTITIES',
      updatedAt: new Date(),
      value: null,
    });
  });

  it('persists canonical TEAM and process identity bindings', async () => {
    vi.mocked(prisma.processes.findMany).mockResolvedValue([
      { id: 'process-paint', name: '喷漆' },
      { id: 'process-unknown', name: 'Unknown Process' },
    ] as any);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: '组装BU', id: 'team-assembly' },
      { dictKey: 'Unknown Team', id: 'team-unknown' },
    ] as any);

    const result = await bootstrapPassRateIdentityBindings();

    expect(result).toEqual({
      processBindings: 1,
      teamBindings: 1,
      unresolvedProcesses: 1,
      unresolvedTeams: 1,
    });
    expect(prisma.system_settings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          updatedAt: expect.any(Date),
          value: JSON.stringify({
            processIds: { 'process-paint': '外协涂装' },
            teamIds: { 'team-assembly': '组装BU' },
          }),
        },
      }),
    );
  });

  it('preserves existing bindings after master-data names change', async () => {
    vi.mocked(prisma.system_settings.findUnique).mockResolvedValue({
      value: JSON.stringify({
        processIds: { 'process-paint': '外协涂装' },
        teamIds: { 'team-assembly': '组装BU' },
      }),
    } as any);
    vi.mocked(prisma.processes.findMany).mockResolvedValue([
      { id: 'process-paint', name: 'Renamed Process' },
    ] as any);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { dictKey: 'Renamed Team', id: 'team-assembly' },
    ] as any);

    const result = await bootstrapPassRateIdentityBindings();

    expect(result).toEqual({
      processBindings: 1,
      teamBindings: 1,
      unresolvedProcesses: 0,
      unresolvedTeams: 0,
    });
  });
});
