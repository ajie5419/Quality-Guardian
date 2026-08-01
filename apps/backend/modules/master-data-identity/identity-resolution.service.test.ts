import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  historical_identity_resolutions: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  identity_resolution_projection: { upsert: vi.fn() },
};

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
    departments: { findFirst: vi.fn() },
    dictionaries: { findFirst: vi.fn() },
    master_parts: { findFirst: vi.fn() },
    master_projects: { findFirst: vi.fn() },
    processes: { findFirst: vi.fn() },
    quality_classification_categories: { findFirst: vi.fn() },
    quality_classification_subcategories: { findFirst: vi.fn() },
    suppliers: { findFirst: vi.fn() },
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  MasterDataResolutionAuditService: { get: vi.fn(), resolve: vi.fn() },
}));

describe('historical identity resolution service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.identity_resolution_projection.upsert.mockResolvedValue({
      id: 'projection-1',
    });
    tx.historical_identity_resolutions.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: `decision-${data.decisionVersion}`, ...data }),
    );
  });

  it('requires an authenticated operator for manual decisions', async () => {
    const { HistoricalIdentityResolutionService } = await import(
      './identity-resolution.service'
    );
    await expect(
      HistoricalIdentityResolutionService.resolveManualWorkItem({
        actorId: '',
        auditId: 'audit-1',
        canonicalId: 'supplier-1',
        note: 'Confirmed',
      }),
    ).rejects.toMatchObject({ code: 'MANUAL_RESOLUTION_OPERATOR_REQUIRED' });
  });

  it('rejects automatic decisions that impersonate a manual operator', async () => {
    const { HistoricalIdentityResolutionService } = await import(
      './identity-resolution.service'
    );
    await expect(
      HistoricalIdentityResolutionService.append(
        {
          canonicalId: 'supplier-1',
          decidedById: 'user-1',
          decisionSource: 'OBSERVED_VALID_ID',
          entityId: 'fact-1',
          entityType: 'inspections',
          fieldName: 'supplierId',
          state: 'RESOLVED',
        },
        tx as never,
      ),
    ).rejects.toMatchObject({
      code: 'AUTOMATIC_RESOLUTION_OPERATOR_FORBIDDEN',
    });
  });

  it('appends a successor instead of mutating the previous decision', async () => {
    const { HistoricalIdentityResolutionService } = await import(
      './identity-resolution.service'
    );
    tx.historical_identity_resolutions.findFirst.mockResolvedValue({
      canonicalId: 'supplier-old',
      decisionVersion: 1,
      id: 'decision-1',
      sourceFingerprint: 'old',
      state: 'RESOLVED',
    });
    const result = await HistoricalIdentityResolutionService.append(
      {
        canonicalId: 'supplier-new',
        decidedById: 'user-1',
        decisionSource: 'MANUAL_DECISION',
        decisionNote: 'Corrected',
        entityId: 'fact-1',
        entityType: 'inspections',
        fieldName: 'supplierId',
        state: 'RESOLVED',
        supersedesId: 'decision-1',
      },
      tx as never,
    );
    expect(result.decision.decisionVersion).toBe(2);
    expect(tx.historical_identity_resolutions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supersedesId: 'decision-1' }),
      }),
    );
    expect(tx.identity_resolution_projection.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a decision when the fact source fingerprint changes', async () => {
    const { createIdentitySourceFingerprint } = await import(
      './identity-resolution.service'
    );
    expect(
      createIdentitySourceFingerprint({
        entityId: 'fact-1',
        entityType: 'inspections',
        fieldName: 'supplierId',
        rawId: 'supplier-1',
        rawName: 'A',
      }),
    ).not.toBe(
      createIdentitySourceFingerprint({
        entityId: 'fact-1',
        entityType: 'inspections',
        fieldName: 'supplierId',
        rawId: 'supplier-1',
        rawName: 'B',
      }),
    );
  });
});
