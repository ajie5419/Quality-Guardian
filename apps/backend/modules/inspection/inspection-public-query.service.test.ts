import { SUPPLIER_CATEGORY } from '@qgs/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionPublicQueryService } from '~/modules/inspection/inspection-public-query.service';
import { ProcessMasterService } from '~/modules/process-master';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    project_boms: {
      findMany: vi.fn(),
    },
    suppliers: {
      findMany: vi.fn(),
    },
    qms_inspection_requests: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    listTeamOptions: vi
      .fn()
      .mockResolvedValue([
        { group: 'internal', label: 'Team A', value: 'team-1' },
      ]),
  },
}));

vi.mock('~/modules/process-master', () => ({
  ProcessMasterService: {
    listInspectionRequestOptions: vi.fn(),
  },
}));

describe('inspection public query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists public suppliers from the supplier category by default', async () => {
    (prisma.suppliers.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'supplier-1', name: 'Supplier A' },
    ]);

    const result = await InspectionPublicQueryService.getPublicSuppliers(
      '  abc  ',
      '',
    );

    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      where: {
        category: SUPPLIER_CATEGORY.SUPPLIER,
        isDeleted: false,
        name: { contains: 'abc' },
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true },
    });
    expect(result).toEqual([{ label: 'Supplier A', value: 'supplier-1' }]);
  });

  it('lists public suppliers from the requested outsourcing category', async () => {
    (prisma.suppliers.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'supplier-2', name: 'Outsourcing A' },
    ]);

    const result = await InspectionPublicQueryService.getPublicSuppliers(
      '',
      SUPPLIER_CATEGORY.OUTSOURCING,
    );

    expect(prisma.suppliers.findMany).toHaveBeenCalledWith({
      where: {
        category: SUPPLIER_CATEGORY.OUTSOURCING,
        isDeleted: false,
      },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true },
    });
    expect(result).toEqual([{ label: 'Outsourcing A', value: 'supplier-2' }]);
  });

  it('returns canonical TEAM IDs for process inspection selection', async () => {
    await expect(
      InspectionPublicQueryService.getPublicTeams('Team'),
    ).resolves.toEqual([
      { group: 'internal', label: 'Team A', value: 'team-1' },
    ]);
  });

  it('returns the independently configured inspection processes', async () => {
    vi.mocked(
      ProcessMasterService.listInspectionRequestOptions,
    ).mockResolvedValue([
      {
        category: 'PROCESS',
        processId: 'process-1',
        processName: 'Canonical Welding',
        responsibleDepartmentId: null,
        supplierSource: 'Supplier',
      },
      {
        category: 'INCOMING',
        processId: 'process-1',
        processName: 'Canonical Welding',
        responsibleDepartmentId: null,
        supplierSource: 'Outsourcing',
      },
    ]);

    await expect(
      InspectionPublicQueryService.getPublicProcesses('WO-1'),
    ).resolves.toEqual([
      {
        category: 'PROCESS',
        processId: 'process-1',
        processName: 'Canonical Welding',
        responsibleDepartmentId: null,
        supplierSource: 'Supplier',
      },
      {
        category: 'INCOMING',
        processId: 'process-1',
        processName: 'Canonical Welding',
        responsibleDepartmentId: null,
        supplierSource: 'Outsourcing',
      },
    ]);
    expect(
      ProcessMasterService.listInspectionRequestOptions,
    ).toHaveBeenCalledOnce();
  });

  it('returns BOM part identities without replacing them with BOM row IDs', async () => {
    (
      prisma.project_boms.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        id: 'bom-1',
        partId: 'part-1',
        part_name: 'Frame',
        part_number: 'P-001',
        work_order_number: 'WO-1',
      },
    ]);

    await expect(
      InspectionPublicQueryService.getPublicBomParts('WO-1'),
    ).resolves.toEqual([
      {
        id: 'bom-1',
        partId: 'part-1',
        partName: 'Frame',
        partNumber: 'P-001',
        workOrderNumber: 'WO-1',
      },
    ]);
  });
});

describe('getTodayIncomingInspections', () => {
  const submittedAt = new Date('2026-06-07T01:00:00Z');
  const closedAt = new Date('2026-06-07T03:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRecord(overrides: Record<string, unknown> = {}) {
    return {
      requestNo: 'IR-20260607-0001',
      partName: '零件A',
      team: '供应商X',
      workOrderNumber: 'WO-001',
      quantity: 10,
      qualifiedQuantity: 10,
      unqualifiedQuantity: 0,
      reporter: '张三',
      status: 'SUBMITTED',
      inspectionResult: 'PASS',
      requestInfo: null,
      submittedAt,
      closedAt: null,
      ...overrides,
    };
  }

  it('correctly buckets pending, pass, fail, and conditional items', async () => {
    const records = [
      makeRecord({ status: 'SUBMITTED' }),
      makeRecord({ requestNo: 'IR-20260607-0002', status: 'DISPATCHED' }),
      makeRecord({ requestNo: 'IR-20260607-0003', status: 'INSPECTING' }),
      makeRecord({
        requestNo: 'IR-20260607-0004',
        status: 'CLOSED',
        inspectionResult: 'PASS',
        closedAt,
      }),
      makeRecord({
        requestNo: 'IR-20260607-0005',
        status: 'CLOSED',
        inspectionResult: 'FAIL',
        closedAt,
      }),
      makeRecord({
        requestNo: 'IR-20260607-0006',
        status: 'CLOSED',
        inspectionResult: 'CONDITIONAL',
        closedAt,
      }),
    ];
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue(records);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.summary).toEqual({
      pending: 3,
      pass: 1,
      fail: 1,
      conditional: 1,
      total: 6,
    });
    expect(result.pendingItems).toHaveLength(3);
    expect(result.passItems).toHaveLength(1);
    expect(result.failItems).toHaveLength(1);
    expect(result.conditionalItems).toHaveLength(1);
    expect(result.truncated).toBe(false);
  });

  it('masks reporter name to first char + asterisk', async () => {
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      makeRecord({ reporter: '张三', status: 'SUBMITTED' }),
    ]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.pendingItems[0]?.reporter).toBe('张*');
  });

  it('masks single-char reporter without asterisk', async () => {
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([makeRecord({ reporter: '张', status: 'SUBMITTED' })]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.pendingItems[0]?.reporter).toBe('张');
  });

  it('parses requestInfo JSON into incomingType and notes', async () => {
    const requestInfo = JSON.stringify({
      incomingType: '首批',
      notes: '外观检验',
    });
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([makeRecord({ status: 'SUBMITTED', requestInfo })]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.pendingItems[0]?.incomingType).toBe('首批');
    expect(result.pendingItems[0]?.notes).toBe('外观检验');
  });

  it('prefers the current process name over the requestInfo snapshot', async () => {
    const requestInfo = JSON.stringify({
      incomingType: '机加成品件',
      notes: '',
    });
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      makeRecord({
        requestInfo,
        process: { name: '机加成品件-外协' },
        status: 'SUBMITTED',
      }),
    ]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.pendingItems[0]?.incomingType).toBe('机加成品件-外协');
  });

  it('sets truncated=true when records hit the 200 limit', async () => {
    const records = Array.from({ length: 200 }, (_, i) =>
      makeRecord({ requestNo: `IR-20260607-${String(i).padStart(4, '0')}` }),
    );
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue(records);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.truncated).toBe(true);
  });

  it('queries incoming category first and falls back only for null legacy rows', async () => {
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(prisma.qms_inspection_requests.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { category: 'INCOMING' },
                { category: null, processName: '进货检验' },
              ],
            },
            {
              OR: [
                {
                  status: { in: ['SUBMITTED', 'DISPATCHED', 'INSPECTING'] },
                },
                {
                  status: 'CLOSED',
                  closedAt: {
                    gte: expect.any(Date),
                    lt: expect.any(Date),
                  },
                },
              ],
            },
          ],
          isDeleted: false,
        },
      }),
    );
  });

  it('buckets FAIL records into fail regardless of status (e.g. re-inspection)', async () => {
    const records = [
      makeRecord({
        requestNo: 'IR-20260607-A1',
        status: 'INSPECTING',
        inspectionResult: 'FAIL',
        qualifiedQuantity: 0,
        unqualifiedQuantity: 1,
      }),
      makeRecord({
        requestNo: 'IR-20260607-A2',
        status: 'DISPATCHED',
        inspectionResult: 'FAIL',
      }),
      makeRecord({
        requestNo: 'IR-20260607-A3',
        status: 'CLOSED',
        inspectionResult: 'FAIL',
        closedAt,
      }),
    ];
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue(records);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.summary.fail).toBe(3);
    expect(result.summary.pending).toBe(0);
    expect(result.failItems.map((item) => item.status)).toEqual([
      'INSPECTING',
      'DISPATCHED',
      'CLOSED',
    ]);
  });

  it('serializes submittedAt and closedAt as ISO strings', async () => {
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      makeRecord({
        status: 'CLOSED',
        inspectionResult: 'PASS',
        submittedAt,
        closedAt,
      }),
    ]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.passItems[0]?.submittedAt).toBe(submittedAt.toISOString());
    expect(result.passItems[0]?.closedAt).toBe(closedAt.toISOString());
  });

  it('keeps cross-day pending tasks (submittedAt yesterday, status SUBMITTED) in pending bucket', async () => {
    const yesterday = new Date('2026-06-06T01:00:00Z');
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      makeRecord({
        requestNo: 'IR-20260606-Y1',
        status: 'SUBMITTED',
        inspectionResult: 'PASS',
        submittedAt: yesterday,
        closedAt: null,
      }),
    ]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.summary.pending).toBe(1);
    expect(result.pendingItems[0]?.requestNo).toBe('IR-20260606-Y1');
  });

  it('keeps cross-day re-inspection (INSPECTING + FAIL submitted yesterday) in fail bucket', async () => {
    const yesterday = new Date('2026-06-06T01:00:00Z');
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      makeRecord({
        requestNo: 'IR-20260606-Y2',
        status: 'INSPECTING',
        inspectionResult: 'FAIL',
        qualifiedQuantity: 0,
        unqualifiedQuantity: 1,
        submittedAt: yesterday,
        closedAt: null,
      }),
    ]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.summary.fail).toBe(1);
    expect(result.failItems[0]?.requestNo).toBe('IR-20260606-Y2');
  });

  it('accepts records closed today even if submitted yesterday into pass bucket', async () => {
    const yesterday = new Date('2026-06-06T01:00:00Z');
    (
      prisma.qms_inspection_requests.findMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      makeRecord({
        requestNo: 'IR-20260606-Y3',
        status: 'CLOSED',
        inspectionResult: 'PASS',
        submittedAt: yesterday,
        closedAt,
      }),
    ]);

    const result =
      await InspectionPublicQueryService.getTodayIncomingInspections();

    expect(result.summary.pass).toBe(1);
    expect(result.passItems[0]?.requestNo).toBe('IR-20260606-Y3');
  });
});
