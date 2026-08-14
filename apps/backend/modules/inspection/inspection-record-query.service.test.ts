import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import { InspectionRecordQueryService } from '~/modules/inspection/inspection-record-query.service';
import prisma from '~/utils/prisma';
import { resolveIncomingTypeNamesByIds } from '~/utils/process-resolver';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspections: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    inspection_form_templates: {
      findUnique: vi.fn(),
    },
    qms_inspection_requests: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ warn: vi.fn() }),
}));

vi.mock('~/modules/dept', () => ({
  DeptService: {
    findActiveByNameContains: vi.fn().mockResolvedValue([]),
    resolveActiveNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue('Welding'),
  resolveIncomingTypeName: vi.fn().mockResolvedValue(null),
  resolveIncomingTypeNamesByIds: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('~/utils/query-helpers', () => ({
  buildKeywordOr: vi.fn().mockReturnValue(null),
  buildYearFilter: vi.fn().mockReturnValue({}),
  parsePagination: vi.fn().mockReturnValue({ skip: 0, take: 100 }),
}));

vi.mock('@qgs/shared', () => ({
  buildInspectionRecordDateRange: vi.fn().mockReturnValue(undefined),
  formatDate: vi.fn((d: any) => (d ? '2024-01-15' : null)),
  normalizeInspectionStationSelection: vi.fn().mockReturnValue(null),
}));

vi.mock('~/modules/inspection/inspection-record-types', () => ({
  deriveInspectionIssueStatus: vi.fn().mockReturnValue('NONE'),
  normalizeInspectionCategory: vi.fn().mockReturnValue('PROCESS'),
  parseTemplateFields: vi.fn().mockReturnValue([]),
  resolveInspectionPrintHeaders: vi.fn().mockReturnValue([]),
}));

vi.mock('~/modules/inspection/inspection-template-meta.service', () => ({
  resolveTemplateMetaFromAttachment: vi.fn().mockResolvedValue({
    drawingNo: null,
    formNo: null,
  }),
}));

const baseInspection = {
  category: 'PROCESS',
  createdAt: new Date(),
  id: 'insp-1',
  inspectionDate: new Date('2024-01-15'),
  inspector: 'Tester',
  isDeleted: false,
  items: [],
  projectName: 'Project A',
  quantity: 10,
  qualifiedQuantity: 10,
  stationSelection: null,
  templateId: null,
  unqualifiedQuantity: 0,
  workOrderNumber: 'WO-1',
};

describe('inspectionRecordQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.qms_inspection_requests.findMany as any).mockResolvedValue([]);
  });

  describe('findById', () => {
    it('should return null when inspection not found', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue(null);

      const result = await InspectionRecordQueryService.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should return inspection with formatted fields', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue({
        ...baseInspection,
        process: { name: 'Welding' },
        reportDate: null,
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Old Welding BU',
        responsibleDepartmentId: 'dept-welding',
      });
      vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(
        new Map([['dept-welding', 'Renamed Welding BU']]),
      );

      const result = await InspectionRecordQueryService.findById('insp-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('insp-1');
      expect(result?.processName).toBe('Welding');
      expect(result?.inspectionDate).toBe('2024-01-15');
      expect(result?.team).toBe('Renamed Welding BU');
    });

    it('should query template when templateId exists', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue({
        ...baseInspection,
        process: { name: 'Welding' },
        reportDate: null,
        templateId: 'tmpl-1',
      });
      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue({
        attachments: null,
        drawingNo: 'DWG-1',
        formFields: '[]',
        formNo: 'FORM-1',
      });

      const result = await InspectionRecordQueryService.findById('insp-1');

      expect(prisma.inspection_form_templates.findUnique).toHaveBeenCalledWith({
        select: {
          attachments: true,
          drawingNo: true,
          formFields: true,
          formNo: true,
        },
        where: { id: 'tmpl-1' },
      });
      expect(result?.drawingNo).toBe('DWG-1');
      expect(result?.formNo).toBe('FORM-1');
    });

    it('uses one linked internal request department for a legacy record', async () => {
      (prisma.inspections.findFirst as any).mockResolvedValue({
        ...baseInspection,
        process: { name: 'Machining' },
        reportDate: null,
        team: null,
      });
      (prisma.qms_inspection_requests.findMany as any).mockResolvedValue([
        {
          inspectionId: 'insp-1',
          inspectionLinks: [],
          responsibleDepartment: 'Machining BU',
        },
      ]);

      const result = await InspectionRecordQueryService.findById('insp-1');

      expect(result?.team).toBe('Machining BU');
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          process: { name: 'Welding' },
          qualityRecords: [],
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('resolves the canonical incoming-type name for incoming records', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          category: 'INCOMING',
          incomingType: '机加成品件',
          incomingTypeId: 'dict-1',
          process: null,
          qualityRecords: [],
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);
      vi.mocked(resolveIncomingTypeNamesByIds).mockResolvedValue(
        new Map([['dict-1', '机加成品件-外协']]),
      );

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items[0]?.incomingType).toBe('机加成品件-外协');
      expect(resolveIncomingTypeNamesByIds).toHaveBeenCalledWith(['dict-1']);
    });

    it('should call forExport mode without skip/take', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([]);
      (prisma.inspections.count as any).mockResolvedValue(0);

      await InspectionRecordQueryService.findAll({ forExport: true });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({
          skip: expect.anything(),
          take: expect.anything(),
        }),
      );
    });

    it('uses the same linked responsibility fallback for export rows', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          process: { name: 'Machining' },
          qualityRecords: [],
          team: null,
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);
      (prisma.qms_inspection_requests.findMany as any).mockResolvedValue([
        {
          inspectionId: null,
          inspectionLinks: [{ inspectionId: 'insp-1' }],
          responsibleDepartment: 'Machining BU',
        },
      ]);

      const result = await InspectionRecordQueryService.findAll({
        forExport: true,
      });

      expect(result.items[0]?.team).toBe('Machining BU');
    });

    it('uses the current department name in exported process records', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          process: { name: 'Machining' },
          qualityRecords: [],
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartment: 'Old Machining BU',
          responsibleDepartmentId: 'dept-machining',
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);
      vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(
        new Map([['dept-machining', 'Renamed Machining BU']]),
      );

      const result = await InspectionRecordQueryService.findAll({
        forExport: true,
      });

      expect(result.items[0]?.team).toBe('Renamed Machining BU');
    });

    it('fails closed for a legacy record linked to different internal departments', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          process: { name: 'Machining' },
          qualityRecords: [],
          team: 'Legacy team',
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);
      (prisma.qms_inspection_requests.findMany as any).mockResolvedValue([
        {
          inspectionId: 'insp-1',
          inspectionLinks: [],
          responsibleDepartment: 'Machining BU',
        },
        {
          inspectionId: null,
          inspectionLinks: [{ inspectionId: 'insp-1' }],
          responsibleDepartment: 'Structure BU',
        },
      ]);

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items[0]?.team).toBeNull();
    });

    it('should fallback when archiveTask include causes schema mismatch', async () => {
      const { isPrismaSchemaMismatchError } = await import(
        '~/utils/prisma-error'
      );
      (isPrismaSchemaMismatchError as any).mockReturnValue(true);
      (prisma.inspections.findMany as any)
        .mockRejectedValueOnce(new Error('schema mismatch'))
        .mockResolvedValue([]);
      (prisma.inspections.count as any).mockResolvedValue(0);

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items).toHaveLength(0);
      expect(prisma.inspections.findMany).toHaveBeenCalledTimes(2);
    });

    it('should compute qualifiedQuantity fallback from quantity minus unqualified', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          process: { name: 'Welding' },
          qualifiedQuantity: null,
          qualityRecords: [{ quantity: 3, status: 'OPEN' }],
          unqualifiedQuantity: null,
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items[0].unqualifiedQuantity).toBe(3);
      expect(result.items[0].qualifiedQuantity).toBe(7);
    });

    it('should use explicit qualifiedQuantity when provided', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: null,
          process: { name: 'Welding' },
          qualifiedQuantity: 8,
          qualityRecords: [],
          unqualifiedQuantity: 2,
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items[0].qualifiedQuantity).toBe(8);
    });

    it('should attach archive task fields', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          archiveTask: {
            dueAt: new Date('2024-02-01'),
            id: 'task-1',
            isOverdue: true,
            status: 'PENDING',
          },
          process: { name: 'Welding' },
          qualityRecords: [],
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findAll({});

      expect(result.items[0].archiveTaskId).toBe('task-1');
      expect(result.items[0].archiveIsOverdue).toBe(true);
      expect(result.items[0].archiveTaskStatus).toBe('PENDING');
    });

    it('should apply incoming and process record filters to query where clause', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([]);
      (prisma.inspections.count as any).mockResolvedValue(0);

      await InspectionRecordQueryService.findAll({
        componentName: 'Gearbox',
        hasDocuments: false,
        inspector: 'Inspector A',
        level1Component: 'Frame',
        materialName: 'Bearing',
        processName: 'Welding',
        projectName: 'Project A',
        supplierName: 'Supplier A',
        team: 'Team A',
        workOrderNumber: 'WO-001',
      });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            hasDocuments: false,
            inspector: { contains: 'Inspector A' },
            level1Component: { contains: 'Frame' },
            level2Component: { contains: 'Gearbox' },
            materialName: { contains: 'Bearing' },
            processName: { contains: 'Welding' },
            projectName: { contains: 'Project A' },
            supplierName: { contains: 'Supplier A' },
            AND: [
              {
                OR: [
                  { team: { contains: 'Team A' } },
                  {
                    category: 'PROCESS',
                    responsibilityType: 'INTERNAL_DEPARTMENT',
                    responsibleDepartment: { contains: 'Team A' },
                  },
                  {
                    category: 'PROCESS',
                    responsibilityType: 'OUTSOURCING_UNIT',
                    supplierName: { contains: 'Team A' },
                  },
                  {
                    AND: [
                      { category: 'PROCESS' },
                      {
                        OR: [
                          { responsibilityType: null },
                          { responsibilityType: 'INTERNAL_DEPARTMENT' },
                        ],
                      },
                      {
                        OR: [
                          { responsibleDepartment: null },
                          { responsibleDepartment: '' },
                        ],
                      },
                      { id: { in: [] } },
                    ],
                  },
                ],
              },
            ],
            workOrderNumber: 'WO-001',
          }),
        }),
      );
    });

    it('should apply an inclusive inspection date range before the year filter', async () => {
      const { buildInspectionRecordDateRange } = await import('@qgs/shared');
      vi.mocked(buildInspectionRecordDateRange).mockReturnValueOnce({
        end: new Date(2026, 6, 21),
        start: new Date(2026, 6, 1),
      });
      (prisma.inspections.findMany as any).mockResolvedValue([]);
      (prisma.inspections.count as any).mockResolvedValue(0);

      await InspectionRecordQueryService.findAll({
        endDate: '2026-07-20',
        startDate: '2026-07-01',
        year: 2025,
      });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            inspectionDate: {
              gte: new Date(2026, 6, 1),
              lt: new Date(2026, 6, 21),
            },
          }),
        }),
      );
    });

    it('filters process records by the current department name in the database', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([]);
      (prisma.inspections.count as any).mockResolvedValue(0);
      vi.mocked(DeptService.findActiveByNameContains).mockResolvedValue([
        { businessUnit: null, id: 'dept-welding', name: 'Renamed Welding BU' },
      ]);

      await InspectionRecordQueryService.findAll({ team: 'Renamed Welding' });

      const where = (prisma.inspections.findMany as any).mock.calls[0][0].where;
      expect(where.AND).toContainEqual(
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              responsibleDepartmentId: { in: ['dept-welding'] },
            }),
          ]),
        }),
      );
      expect(prisma.inspections.count).toHaveBeenCalledWith({ where });
    });

    it('should locate a source record by ID without applying list filters', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([]);
      (prisma.inspections.count as any).mockResolvedValue(0);

      await InspectionRecordQueryService.findAll({
        keyword: 'unrelated keyword',
        page: 8,
        pageSize: 100,
        sourceInspectionId: 'inspection-101',
        type: 'INCOMING',
        year: 2025,
      });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'inspection-101',
            isDeleted: false,
          },
          skip: 0,
          take: 1,
        }),
      );
    });
  });

  describe('findSupplierHistory', () => {
    it('reads incoming supplier records by canonical identity and maps material name', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          category: 'INCOMING',
          level1Component: null,
          materialName: 'Gear',
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findSupplierHistory({
        category: 'INCOMING',
        identitySource: 'supplier',
        supplierId: 'supplier-1',
      });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            category: 'INCOMING',
            isDeleted: false,
            supplierId: 'supplier-1',
          },
        }),
      );
      expect(result.items[0].partName).toBe('Gear');
    });

    it('reads process records by mapped TEAM IDs and maps level-one component', async () => {
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          level1Component: 'Main Beam',
          materialName: null,
          team: 'Resident Team',
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findSupplierHistory({
        category: 'PROCESS',
        identitySource: 'team',
        supplierId: 'supplier-1',
        teamIds: ['team-1'],
      });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            category: 'PROCESS',
            isDeleted: false,
            teamId: { in: ['team-1'] },
          },
        }),
      );
      expect(result.items[0].partName).toBe('Main Beam');
    });

    it('returns no process history when no TEAM mapping exists', async () => {
      await expect(
        InspectionRecordQueryService.findSupplierHistory({
          category: 'PROCESS',
          identitySource: 'team',
          supplierId: 'supplier-1',
          teamIds: [],
        }),
      ).resolves.toEqual({ items: [], total: 0 });
      expect(prisma.inspections.findMany).not.toHaveBeenCalled();
    });

    it('resolves the current process name from the linked process', async () => {
      const { resolveCanonicalProcessName } = await import(
        '~/utils/process-resolver'
      );
      vi.mocked(resolveCanonicalProcessName).mockReturnValue('机加成品件-外协');
      (prisma.inspections.findMany as any).mockResolvedValue([
        {
          ...baseInspection,
          category: 'INCOMING',
          materialName: 'Gear',
          process: { name: '机加成品件-外协' },
          processName: '机加成品件',
        },
      ]);
      (prisma.inspections.count as any).mockResolvedValue(1);

      const result = await InspectionRecordQueryService.findSupplierHistory({
        category: 'INCOMING',
        identitySource: 'supplier',
        supplierId: 'supplier-1',
      });

      expect(prisma.inspections.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            process: { select: { name: true } },
          },
        }),
      );
      expect(result.items[0].processName).toBe('机加成品件-外协');
      expect(resolveCanonicalProcessName).toHaveBeenCalledWith(
        expect.objectContaining({ process: { name: '机加成品件-外协' } }),
      );
    });
  });
});
