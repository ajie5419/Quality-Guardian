import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import prisma from '~/utils/prisma';

import {
  backfillBomRequiredProcessIdentities,
  backfillInspectionPartIdentities,
} from './identity-relation-backfill';

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalIdsByNames: vi.fn(),
    resolveCanonicalNameById: vi.fn(),
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    inspections: { findMany: vi.fn(), updateMany: vi.fn() },
    project_bom_required_processes: {
      count: vi.fn(),
      createMany: vi.fn(),
    },
    project_boms: { findMany: vi.fn() },
    unresolved_master_data_refs: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('identity relation backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(prisma as never),
    );
    vi.mocked(prisma.unresolved_master_data_refs.updateMany).mockResolvedValue({
      count: 0,
    });
    vi.mocked(prisma.unresolved_master_data_refs.upsert).mockResolvedValue(
      {} as never,
    );
  });

  it('inherits a canonical part identity from the linked request', async () => {
    vi.mocked(prisma.inspections.findMany).mockResolvedValue([
      {
        category: 'PROCESS',
        id: 'inspection-1',
        inspectionRequest: { partId: 'part-1', partName: 'Old Part' },
        inspectionRequestLinks: [],
        isDeleted: false,
        level1Component: 'Old Part',
        materialName: null,
        partId: null,
        partName: null,
      },
    ] as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockResolvedValue('Current Part');
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({ count: 1 });

    await expect(
      backfillInspectionPartIdentities({ batchSize: 10 }),
    ).resolves.toEqual({ processed: 1, updated: 1 });
    expect(prisma.inspections.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inspection-1',
        partId: null,
        partName: null,
      },
      data: { partId: 'part-1', partName: 'Current Part' },
    });
    expect(prisma.inspections.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false, partId: null } }),
    );
  });

  it('records conflicting linked request identities without guessing', async () => {
    vi.mocked(prisma.inspections.findMany).mockResolvedValue([
      {
        category: 'PROCESS',
        id: 'inspection-1',
        inspectionRequest: { partId: 'part-1', partName: 'Same Part' },
        inspectionRequestLinks: [
          { request: { partId: 'part-2', partName: 'Same Part' } },
        ],
        level1Component: 'Same Part',
        materialName: null,
        partId: null,
        partName: null,
      },
    ] as never);

    await backfillInspectionPartIdentities({ batchSize: 10 });

    expect(prisma.inspections.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: 'CONFLICT' }),
      }),
    );
  });

  it('preserves an existing historical part name snapshot', async () => {
    vi.mocked(prisma.inspections.findMany).mockResolvedValue([
      {
        category: 'PROCESS',
        id: 'inspection-1',
        inspectionRequest: { partId: 'part-1', partName: 'Current Part' },
        inspectionRequestLinks: [],
        level1Component: 'Historical Part',
        materialName: null,
        partId: null,
        partName: 'Historical Part',
      },
    ] as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalNameById,
    ).mockResolvedValue('Current Part');
    vi.mocked(prisma.inspections.updateMany).mockResolvedValue({ count: 1 });

    await backfillInspectionPartIdentities({ batchSize: 10 });

    expect(prisma.inspections.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'inspection-1',
        partId: null,
        partName: 'Historical Part',
      },
      data: { partId: 'part-1' },
    });
  });

  it('creates BOM process relations only when every name resolves', async () => {
    vi.mocked(prisma.project_boms.findMany).mockResolvedValue([
      { id: 'bom-1', required_processes: '["Welding","Painting"]' },
    ] as never);
    vi.mocked(
      MasterDataGovernanceKernel.resolveCanonicalIdsByNames,
    ).mockResolvedValue(
      new Map([
        ['Painting', 'process-2'],
        ['Welding', 'process-1'],
      ]),
    );
    vi.mocked(prisma.project_bom_required_processes.count).mockResolvedValue(0);
    vi.mocked(
      prisma.project_bom_required_processes.createMany,
    ).mockResolvedValue({ count: 2 });

    await expect(
      backfillBomRequiredProcessIdentities({ batchSize: 10 }),
    ).resolves.toEqual({ processed: 1, updated: 1 });
    expect(
      prisma.project_bom_required_processes.createMany,
    ).toHaveBeenCalledWith({
      data: [
        {
          bomId: 'bom-1',
          position: 0,
          processId: 'process-1',
          processName: 'Welding',
        },
        {
          bomId: 'bom-1',
          position: 1,
          processId: 'process-2',
          processName: 'Painting',
        },
      ],
    });
  });
});
