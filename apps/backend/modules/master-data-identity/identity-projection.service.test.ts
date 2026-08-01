import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = {
  $transaction: vi.fn((callback: (client: typeof db) => unknown) =>
    callback(db),
  ),
  historical_identity_resolutions: { findMany: vi.fn() },
  identity_projection_generation_pointer: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  identity_projection_generations: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  identity_resolution_projection: { createMany: vi.fn(), upsert: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({ default: db }));

describe('identity projection generation service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.identity_projection_generation_pointer.upsert.mockResolvedValue({
      resolutionVersion: 4,
    });
    db.identity_projection_generations.create.mockResolvedValue({
      id: 'generation-1',
    });
    db.historical_identity_resolutions.findMany
      .mockResolvedValueOnce([
        {
          canonicalId: 'process-1',
          decisionVersion: 1,
          entityId: 'inspection-1',
          entityType: 'inspections',
          fieldName: 'processId',
          id: 'decision-1',
          sourceFingerprint: 'fingerprint-1',
          state: 'RESOLVED',
        },
      ])
      .mockResolvedValueOnce([]);
    db.identity_resolution_projection.createMany.mockResolvedValue({
      count: 1,
    });
  });

  it('keeps readers on the old generation while staging rows are built', async () => {
    const { IdentityProjectionService } = await import(
      './identity-projection.service'
    );
    const staged = await IdentityProjectionService.createStagedGeneration();

    expect(staged).toMatchObject({
      generationId: 'generation-1',
      sourceResolutionVersion: 4,
      written: 1,
    });
    expect(
      db.identity_projection_generation_pointer.updateMany,
    ).not.toHaveBeenCalled();
    expect(db.identity_resolution_projection.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ generationId: 'generation-1' })],
    });
  });

  it('does not switch the pointer when source decisions change during build', async () => {
    const { IdentityProjectionService } = await import(
      './identity-projection.service'
    );
    db.identity_projection_generations.findUnique.mockResolvedValue({
      id: 'generation-1',
      status: 'BUILDING',
    });
    db.identity_projection_generation_pointer.updateMany.mockResolvedValue({
      count: 0,
    });

    const result = await IdentityProjectionService.publishStagedGeneration({
      generationId: 'generation-1',
      sourceResolutionVersion: 4,
    });

    expect(result).toEqual({ published: false, reason: 'SOURCE_CHANGED' });
    expect(db.identity_projection_generations.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(
      db.identity_projection_generations.updateMany,
    ).not.toHaveBeenCalled();
  });
});
