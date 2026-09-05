import type {
  CreateMetricDefinitionInput,
  MetricConflictStatus,
  MetricVersionInput,
} from './metric-governance.types';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemLogService } from '~/modules/system-log';
import prisma from '~/utils/prisma';

import { bootstrapCanonicalMetricDefinitions } from './metric-governance-bootstrap';
import {
  approvedCanonicalMetricDefinitions,
  canonicalMappings,
  finalizeApprovedMetricRegistry,
} from './metric-governance-finalization';
import { MetricGovernanceService } from './metric-governance.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    metric_canonical_mappings: { create: vi.fn(), findUnique: vi.fn() },
    metric_definition_versions: { create: vi.fn(), updateMany: vi.fn() },
    metric_definitions: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    metric_owner_assignments: { createMany: vi.fn() },
  },
}));

vi.mock('~/modules/system-log', () => ({
  SystemLogService: { auditLog: vi.fn() },
}));

const actor = { userId: 'admin-1' };

type TestMetricVersion = MetricVersionInput & {
  activationEvidences: Array<{
    activationNote: string;
    decision: string;
    decisionBy: string;
    effectiveFromAt: Date;
  }>;
  approvalEvidence: string;
  approvalEvidences: Array<{
    decisionBy: string;
    decisionStatus: string;
    sourceDocument: string;
  }>;
  decisionHistoryId: string;
  policyDependencies: Array<{ status: string }>;
  shadowValidationEvidence: string;
  sourceDocument: string;
};

function version(
  conflictStatus: MetricConflictStatus = 'CANONICAL_CANDIDATE',
): TestMetricVersion {
  return {
    businessDefinition: 'Qualified quantity within the reporting scope.',
    changeReason: 'Test definition',
    conflictStatus,
    approvalEvidence: 'Human Business Approval',
    approvalEvidences: [
      {
        decisionBy: 'Human Business Approval',
        decisionStatus: 'APPROVED',
        sourceDocument:
          'docs/metrics/metric-approval-sheet.md#final-human-decision-record',
      },
    ],
    activationEvidences: [
      {
        activationNote: 'Approved for controlled activation in test.',
        decision: 'APPROVE',
        decisionBy: 'Human Business Approval',
        effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      },
    ],
    denominatorDefinition: 'Total quantity',
    decisionHistoryId: 'D01',
    dimensions: { supported: ['period'] },
    effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
    exclusions: {},
    formulaType: 'PERCENTAGE',
    numeratorDefinition: 'Qualified quantity',
    precision: 2,
    policyDependencies: [],
    refreshPolicy: 'SOURCE_QUERY',
    scopePolicy: 'SOURCE_INHERITED',
    sourceFields: { quantity: ['quantity'] },
    sourceDocument:
      'docs/metrics/metric-approval-sheet.md#final-human-decision-record',
    shadowValidationEvidence: 'phase-2a-snapshot:test',
    sourceModel: { primary: 'inspections' },
    unit: '%',
  };
}

function definition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'metric-1',
    metricCode: 'BM-PASS-RATE',
    metricName: 'Pass Rate',
    domain: 'inspection',
    category: 'A',
    ownerDeptId: null,
    ownerStatus: 'CONFIRMED_FROM_APPROVAL',
    ownerAssignments: [
      {
        ownerLabel: '品质部',
        ownerRole: 'BUSINESS',
        ownerStatus: 'CONFIRMED_FROM_APPROVAL',
      },
    ],
    status: 'DRAFT',
    currentVersion: 1,
    revision: 1,
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    versions: [
      {
        id: 'version-1',
        metricDefinitionId: 'metric-1',
        version: 1,
        ...version(),
      },
    ],
    ...overrides,
  };
}

function createInput(): CreateMetricDefinitionInput {
  return {
    category: 'A',
    domain: 'inspection',
    metricCode: 'BM-PASS-RATE',
    metricName: 'Pass Rate',
    version: version(),
  };
}

describe('metricGovernanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a unique code with its immutable first version', async () => {
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.metric_definitions.create).mockResolvedValue(
      definition() as any,
    );

    await MetricGovernanceService.createDefinition(createInput(), actor);

    expect(prisma.metric_definitions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentVersion: 1,
          metricCode: 'BM-PASS-RATE',
        }),
      }),
    );
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'metric-governance',
      'create',
      expect.any(Object),
    );
  });

  it('rejects duplicate metric codes before creating another definition', async () => {
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue({
      id: 'metric-1',
    } as any);

    await expect(
      MetricGovernanceService.createDefinition(createInput(), actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.metric_definitions.create).not.toHaveBeenCalled();
  });

  it('requires a valid stable metric code', async () => {
    const input = createInput();
    input.metricCode = 'pass-rate';

    await expect(
      MetricGovernanceService.createDefinition(input, actor),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('keeps an unknown owner explicit and rejects a fabricated department', async () => {
    const input = createInput();
    input.ownerStatus = 'UNCONFIRMED';
    input.ownerDeptId = 'dept-1';

    await expect(
      MetricGovernanceService.createDefinition(input, actor),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('requires a department before confirming an owner', async () => {
    const input = createInput();
    input.ownerStatus = 'CONFIRMED';

    await expect(
      MetricGovernanceService.createDefinition(input, actor),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects executable metadata instead of accepting a formula script', async () => {
    const input = createInput();
    input.version.sourceModel = { expression: 'SELECT * FROM inspections' };

    await expect(
      MetricGovernanceService.createDefinition(input, actor),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('does not activate a definition with a business decision conflict', async () => {
    const current = definition({
      versions: [
        {
          id: 'version-1',
          metricDefinitionId: 'metric-1',
          version: 1,
          ...version('BUSINESS_DECISION_REQUIRED'),
        },
      ],
    });
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(
      current as any,
    );

    await expect(
      MetricGovernanceService.activate('metric-1', 1, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.metric_definitions.updateMany).not.toHaveBeenCalled();
  });

  it('activates a canonical candidate through status and revision CAS', async () => {
    const current = definition();
    const after = definition({ status: 'ACTIVE', revision: 2 });
    vi.mocked(prisma.metric_definitions.findUnique)
      .mockResolvedValueOnce(current as any)
      .mockResolvedValueOnce(after as any);
    vi.mocked(prisma.metric_definitions.updateMany).mockResolvedValue({
      count: 1,
    });
    await MetricGovernanceService.activate('metric-1', 1, actor);

    expect(prisma.metric_definitions.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACTIVE' }),
        where: expect.objectContaining({ revision: 1, status: 'DRAFT' }),
      }),
    );
    expect(prisma.metric_definition_versions.updateMany).not.toHaveBeenCalled();
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'metric-governance',
      'activate',
      expect.any(Object),
    );
  });

  it('rejects activation without an approval evidence row', async () => {
    const current = definition({
      versions: [
        {
          id: 'version-1',
          metricDefinitionId: 'metric-1',
          version: 1,
          ...version(),
          approvalEvidences: [],
        },
      ],
    });
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(
      current as any,
    );

    await expect(
      MetricGovernanceService.activate('metric-1', 1, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.metric_definitions.updateMany).not.toHaveBeenCalled();
  });

  it('rejects activation while a policy dependency is pending', async () => {
    const current = definition({
      versions: [
        {
          id: 'version-1',
          metricDefinitionId: 'metric-1',
          version: 1,
          ...version(),
          policyDependencies: [{ status: 'PENDING' }],
        },
      ],
    });
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(
      current as any,
    );

    await expect(
      MetricGovernanceService.activate('metric-1', 1, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.metric_definitions.updateMany).not.toHaveBeenCalled();
  });

  it('uses revision compare-and-swap for draft metadata updates', async () => {
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(
      definition({ revision: 2 }) as any,
    );

    await expect(
      MetricGovernanceService.updateDraft(
        'metric-1',
        { expectedRevision: 1, metricName: 'New Name' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.metric_definitions.updateMany).not.toHaveBeenCalled();
  });

  it('rejects direct metadata overwrite after activation', async () => {
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(
      definition({ status: 'ACTIVE' }) as any,
    );

    await expect(
      MetricGovernanceService.updateDraft(
        'metric-1',
        { expectedRevision: 1, metricName: 'New Name' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('records an owner change as its own audit action', async () => {
    const current = definition();
    const after = definition({
      ownerDeptId: 'dept-1',
      ownerStatus: 'CONFIRMED',
      revision: 2,
    });
    vi.mocked(prisma.metric_definitions.findUnique)
      .mockResolvedValueOnce(current as any)
      .mockResolvedValueOnce(after as any);
    vi.mocked(prisma.metric_definitions.updateMany).mockResolvedValue({
      count: 1,
    });

    await MetricGovernanceService.updateDraft(
      'metric-1',
      {
        expectedRevision: 1,
        ownerDeptId: 'dept-1',
        ownerStatus: 'CONFIRMED',
      },
      actor,
    );

    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'metric-governance',
      'ownerChange',
      expect.any(Object),
    );
  });

  it('creates a new append-only version inside a revision constrained transaction', async () => {
    const current = definition({ status: 'ACTIVE' });
    const after = definition({
      currentVersion: 2,
      revision: 2,
      versions: [
        {
          id: 'version-2',
          metricDefinitionId: 'metric-1',
          version: 2,
          ...version(),
        },
        {
          id: 'version-1',
          metricDefinitionId: 'metric-1',
          version: 1,
          ...version(),
        },
      ],
    });
    vi.mocked(prisma.metric_definitions.findUnique)
      .mockResolvedValueOnce(current as any)
      .mockResolvedValueOnce(after as any);
    vi.mocked(prisma.metric_definitions.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) =>
      callback(prisma),
    );

    await MetricGovernanceService.createNewVersion(
      'metric-1',
      { ...version(), expectedRevision: 1 },
      actor,
    );

    expect(prisma.metric_definition_versions.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metricDefinitionId: 'metric-1',
        version: 2,
      }),
    });
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'metric-governance',
      'newVersion',
      expect.any(Object),
    );
  });

  it('rejects a new version for a deprecated definition', async () => {
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue(
      definition({ status: 'DEPRECATED' }) as any,
    );

    await expect(
      MetricGovernanceService.createNewVersion(
        'metric-1',
        { ...version(), expectedRevision: 1 },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.metric_definition_versions.create).not.toHaveBeenCalled();
  });

  it('deprecates only through a status and revision constrained update', async () => {
    const current = definition({ status: 'ACTIVE' });
    const after = definition({ status: 'DEPRECATED', revision: 2 });
    vi.mocked(prisma.metric_definitions.findUnique)
      .mockResolvedValueOnce(current as any)
      .mockResolvedValueOnce(after as any);
    vi.mocked(prisma.metric_definitions.updateMany).mockResolvedValue({
      count: 1,
    });

    await MetricGovernanceService.deprecate(
      'metric-1',
      1,
      'Replaced by an approved successor',
      actor,
    );

    expect(prisma.metric_definitions.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: 1 }),
      }),
    );
    expect(SystemLogService.auditLog).toHaveBeenCalledWith(
      'metric-governance',
      'deprecate',
      expect.any(Object),
    );
  });

  it('bootstraps only missing canonical definitions and never activates them', async () => {
    vi.mocked(prisma.metric_definitions.findUnique)
      .mockResolvedValueOnce({ id: 'existing' } as any)
      .mockResolvedValue(null);
    vi.mocked(prisma.metric_definitions.create).mockResolvedValue(
      definition() as any,
    );

    const result = await bootstrapCanonicalMetricDefinitions();

    expect(result.totalDefinitions).toBe(10);
    expect(prisma.metric_definitions.create).toHaveBeenCalledTimes(9);
    expect(prisma.metric_definitions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerStatus: 'UNCONFIRMED',
          status: 'DRAFT',
        }),
      }),
    );
  });

  it('makes a bootstrap rerun a no-op without duplicate version rows', async () => {
    vi.mocked(prisma.metric_definitions.findUnique).mockResolvedValue({
      id: 'existing',
    } as any);

    const result = await bootstrapCanonicalMetricDefinitions();

    expect(result.createdDefinitions).toBe(0);
    expect(prisma.metric_definitions.create).not.toHaveBeenCalled();
  });

  it('finalizes approved canonical definitions as DRAFT versions with approval evidence and version lineage', async () => {
    const canonicalCodes = new Set(
      approvedCanonicalMetricDefinitions.map((item) => item.metricCode),
    );
    vi.mocked(prisma.metric_definitions.findUnique).mockImplementation((async ({
      where,
    }: any) => {
      const metricCode = where.metricCode as string;
      if (canonicalCodes.has(metricCode)) return null as any;
      return { id: `legacy-${metricCode}` } as any;
    }) as never);
    vi.mocked(prisma.metric_definitions.create).mockImplementation((async ({
      data,
    }: any) => ({
      currentVersion: 1,
      id: `metric-${data.metricCode}`,
      versions: [{ id: `version-${data.metricCode}`, version: 1 }],
    })) as never);
    vi.mocked(prisma.metric_canonical_mappings.findUnique).mockResolvedValue(
      null as any,
    );

    const result = await finalizeApprovedMetricRegistry();

    expect(result).toEqual({
      canonicalMetricCount: approvedCanonicalMetricDefinitions.length,
      mappingCount: canonicalMappings.length,
    });
    expect(prisma.metric_definitions.create).toHaveBeenCalledTimes(
      approvedCanonicalMetricDefinitions.length,
    );
    expect(prisma.metric_definitions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metricCode: 'BM-FIRST-PASS-YIELD',
          ownerDeptId: null,
          ownerStatus: 'CONFIRMED_FROM_APPROVAL',
          status: 'DRAFT',
          versions: expect.objectContaining({
            create: expect.objectContaining({
              approvalEvidences: expect.objectContaining({
                create: expect.arrayContaining([
                  expect.objectContaining({
                    decisionHistoryId: 'D01',
                    decisionStatus: 'APPROVED',
                  }),
                ]),
              }),
              version: 1,
            }),
          }),
        }),
      }),
    );
    expect(prisma.metric_canonical_mappings.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          canonicalMetricDefinitionVersionId: 'version-BM-FIRST-PASS-YIELD',
          legacyMetricDefinitionId: 'legacy-BM-PASS-RATE',
          mappingType: 'SPLIT_TO',
        }),
      }),
    );
  });

  it('lists only registry metadata and does not query metric source tables', async () => {
    vi.mocked(prisma.metric_definitions.findMany).mockResolvedValue([] as any);

    await MetricGovernanceService.listDefinitions();

    expect(prisma.metric_definitions.findMany).toHaveBeenCalledOnce();
    expect(prisma.metric_definition_versions.create).not.toHaveBeenCalled();
  });
});
