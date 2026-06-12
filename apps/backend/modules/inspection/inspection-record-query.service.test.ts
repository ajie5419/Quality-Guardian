import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRecordQueryService } from '~/modules/inspection/inspection-record-query.service';
import prisma from '~/utils/prisma';

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
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ warn: vi.fn() }),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue('Welding'),
}));

vi.mock('~/utils/query-helpers', () => ({
  buildKeywordOr: vi.fn().mockReturnValue(null),
  buildYearFilter: vi.fn().mockReturnValue({}),
  parsePagination: vi.fn().mockReturnValue({ skip: 0, take: 100 }),
}));

vi.mock('@qgs/shared', () => ({
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
      });

      const result = await InspectionRecordQueryService.findById('insp-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('insp-1');
      expect(result?.processName).toBe('Welding');
      expect(result?.inspectionDate).toBe('2024-01-15');
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
  });
});
