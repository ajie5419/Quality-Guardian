import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionIssueCreateService } from '~/modules/inspection/inspection-issue-create.service';
import { InspectionIssueMutationService } from '~/modules/inspection/inspection-issue-mutation.service';
import { WelderScoreRefreshService } from '~/modules/welder';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => {
  const qualityRecords = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  };
  const transactionClient = {
    metric_refresh_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    quality_loss_index_jobs: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    quality_classification_subcategories: {
      findFirst: vi.fn(),
    },
    quality_records: qualityRecords,
  };
  return {
    default: {
      ...transactionClient,
      $transaction: vi.fn((callback) => callback(transactionClient)),
    },
  };
});

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/system-log.service', () => ({
  SystemLogService: {
    auditLog: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/welder', () => ({
  WelderScoreRefreshService: {
    enqueueForResponsibleText: vi.fn(),
    enqueueFullRefresh: vi.fn(),
    resolveResponsibleWelderId: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('~/modules/quality-loss', () => ({
  QualityLossIndexQueue: { enqueue: vi.fn() },
}));

vi.mock('~/modules/file-storage/import-report', () => ({
  buildImportRowError: vi.fn().mockReturnValue({}),
  buildImportSummary: vi.fn().mockReturnValue({}),
  inferImportErrorField: vi.fn().mockReturnValue('unknown'),
  toImportErrorMessage: vi.fn().mockReturnValue('error'),
}));

vi.mock('~/modules/inspection/inspection-issue', () => ({
  buildInspectionIssueCreateData: vi.fn().mockResolvedValue({
    partName: 'Part',
    processName: 'Weld',
  }),
  buildInspectionIssueUpdateData: vi.fn().mockResolvedValue({
    partName: 'Updated',
  }),
  buildInspectionIssueUpsertPayload: vi.fn(),
  createInspectionIssueId: vi.fn().mockReturnValue('ISS-2026-001'),
  findInspectionForIssue: vi.fn().mockResolvedValue(null),
  getNextInspectionIssueSerialNumber: vi.fn().mockResolvedValue(1),
  hasInspectionIssueWriteAccess: vi.fn(
    ({
      createdBy,
      roles,
      userId,
    }: {
      createdBy: null | string;
      roles?: unknown;
      userId: unknown;
    }) =>
      (Array.isArray(roles) && roles.includes('admin')) || createdBy === userId,
  ),
}));

vi.mock('~/modules/inspection/inspection-issue-access.service', () => ({
  applyInspectionIssueWriteOwnership: vi.fn(
    (
      where: Record<string, unknown>,
      { roles, userId }: { roles?: unknown; userId: string },
    ) =>
      Array.isArray(roles) && roles.includes('admin')
        ? where
        : { ...where, createdBy: userId },
  ),
  InspectionIssueAccessService: {
    ensurePermission: vi.fn(),
    getAccessContext: vi.fn((userinfo: { id?: unknown; roles?: unknown }) =>
      Promise.resolve({
        roles: userinfo.roles,
        userId: String(userinfo.id || ''),
      }),
    ),
  },
}));

vi.mock('~/modules/inspection/inspection-issue-create.service', () => ({
  InspectionIssueCreateService: {
    createInTransaction: vi.fn(async ({ tx }: { tx: typeof prisma }) => {
      const record = await tx.quality_records.create({ data: {} as never });
      return { ncNumber: record.nonConformanceNumber, record };
    }),
  },
  validateOnlineInspectionIssueResponsibilityInput: vi.fn(),
}));

vi.mock('~/modules/inspection/inspection-issue-responsibility.service', () => ({
  resolveInspectionIssueResponsibility: vi.fn().mockResolvedValue({
    responsibleDepartment: 'Assembly',
    responsibleDepartmentId: 'dept-assembly',
    responsibilityType: 'INTERNAL_DEPARTMENT',
    supplierId: null,
    supplierName: null,
  }),
}));

const mockLoggerFns = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('~/utils/logger', () => ({
  createModuleLogger: vi.fn(() => mockLoggerFns),
}));

describe('inspectionIssueMutationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      InspectionIssueCreateService.createInTransaction,
    ).mockImplementation(async ({ tx }) => {
      const record = await tx.quality_records.create({ data: {} as never });
      return { ncNumber: record.nonConformanceNumber, record };
    });
    vi.mocked(
      WelderScoreRefreshService.enqueueForResponsibleText,
    ).mockResolvedValue({ enqueued: 0 } as never);
    vi.mocked(WelderScoreRefreshService.enqueueFullRefresh).mockResolvedValue({
      enqueued: 0,
    } as never);
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
    (prisma.quality_records.findUnique as any).mockResolvedValue(null);
  });

  describe('createIssue', () => {
    it('should create a quality record and return it with ncNumber', async () => {
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-001',
        nonConformanceNumber: 'NC-26KJ-001',
        partName: 'Part',
      });

      const result = await InspectionIssueMutationService.createIssue(
        mockUser,
        {},
      );

      expect(prisma.quality_records.create).toHaveBeenCalled();
      expect(result.ncNumber).toBe('NC-26KJ-001');
      expect(
        InspectionIssueCreateService.createInTransaction,
      ).toHaveBeenCalledWith(expect.objectContaining({ body: {} }));
    });

    it('delegates NC allocation to the unified create service', async () => {
      const { InspectionIssueCreateService } = await import(
        '~/modules/inspection/inspection-issue-create.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-001',
        nonConformanceNumber: 'NC-CUSTOM-001',
        partName: 'Part',
      });

      await InspectionIssueMutationService.createIssue(mockUser, {});

      expect(
        InspectionIssueCreateService.createInTransaction,
      ).toHaveBeenCalledWith(expect.objectContaining({ body: {} }));
    });

    it('retries a serial conflict through the unified create service', async () => {
      const { InspectionIssueCreateService } = await import(
        '~/modules/inspection/inspection-issue-create.service'
      );
      const conflict = Object.assign(
        new Error('Unique constraint failed on serialNumber'),
        { code: 'P2002', meta: { target: ['serialNumber'] } },
      );
      vi.mocked(InspectionIssueCreateService.createInTransaction)
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({
          ncNumber: 'NC-26KJ-002',
          record: {
            id: 'ISS-2026-002',
            nonConformanceNumber: 'NC-26KJ-002',
            partName: 'Part',
          } as never,
        });

      const result = await InspectionIssueMutationService.createIssue(
        { id: 'user-1', username: 'admin' } as any,
        {},
      );

      expect(
        InspectionIssueCreateService.createInTransaction,
      ).toHaveBeenCalledTimes(2);
      expect(result.ncNumber).toBe('NC-26KJ-002');
    });

    it('should throw when sourceType is INSPECTION and inspectionId is missing', async () => {
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await expect(
        InspectionIssueMutationService.createIssue(mockUser, {
          sourceType: 'INSPECTION',
        }),
      ).rejects.toThrow('检验记录来源创建不合格项时必须携带 inspectionId');
    });

    it('should register photo references after creation', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-002',
        nonConformanceNumber: 'NC-26KJ-002',
        partName: 'Part',
      });

      await InspectionIssueMutationService.createIssue(mockUser, {
        photos: ['photo1.jpg'],
      });

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).toHaveBeenCalledWith({
        attachments: ['photo1.jpg'],
        bizId: 'ISS-2026-002',
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    });

    it('should sync welder scores after creation', async () => {
      const { WelderScoreRefreshService } = await import('~/modules/welder');
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-003',
        nonConformanceNumber: 'NC-26KJ-003',
        partName: 'Part',
      });

      await InspectionIssueMutationService.createIssue(mockUser, {});

      // Score enqueue happens inside createInTransaction (mocked here), so the
      // mutation service itself must not enqueue a second time.
      expect(
        WelderScoreRefreshService.enqueueForResponsibleText,
      ).not.toHaveBeenCalled();
    });

    it('should retry on P2002 serialNumber conflict and succeed on second attempt', async () => {
      const { InspectionIssueCreateService } = await import(
        '~/modules/inspection/inspection-issue-create.service'
      );

      const p2002 = Object.assign(
        new Error('Unique constraint failed on the fields: (`serialNumber`)'),
        { code: 'P2002', meta: { target: ['serialNumber'] } },
      );
      vi.mocked(InspectionIssueCreateService.createInTransaction)
        .mockRejectedValueOnce(p2002)
        .mockResolvedValueOnce({
          ncNumber: 'NC-26KJ-010',
          record: {
            id: 'ISS-retry-1',
            nonConformanceNumber: 'NC-26KJ-010',
            partName: 'Part',
          } as never,
        });

      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      const result = await InspectionIssueMutationService.createIssue(
        mockUser,
        {},
      );

      expect(
        InspectionIssueCreateService.createInTransaction,
      ).toHaveBeenCalledTimes(2);
      expect(result.ncNumber).toBe('NC-26KJ-010');
    });

    it('does not retry createIssue on a generic (non-P2002) error', async () => {
      const networkError = new Error('DB connection lost');
      const { InspectionIssueCreateService } = await import(
        '~/modules/inspection/inspection-issue-create.service'
      );
      vi.mocked(
        InspectionIssueCreateService.createInTransaction,
      ).mockRejectedValue(networkError);

      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      await expect(
        InspectionIssueMutationService.createIssue(mockUser, {}),
      ).rejects.toThrow('DB connection lost');

      expect(
        InspectionIssueCreateService.createInTransaction,
      ).toHaveBeenCalledTimes(1);
    });

    it('delegates welding validation to the unified create service', async () => {
      (
        prisma.quality_classification_subcategories.findFirst as any
      ).mockResolvedValue({
        code: 'WELDING_DEFECT',
        name: '焊接缺陷',
      });
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.createIssue(mockUser, {
        defectSubcategoryId: 'sub-welding',
        processName: '外购件',
        responsibleWelder: '',
      });
      expect(
        InspectionIssueCreateService.createInTransaction,
      ).toHaveBeenCalled();
    });

    it('accepts welding defects when a responsible welder is provided', async () => {
      (
        prisma.quality_classification_subcategories.findFirst as any
      ).mockResolvedValue({
        code: 'WELDING_DEFECT',
        name: '焊接缺陷',
      });
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-005',
        nonConformanceNumber: 'NC-26KJ-005',
        partName: 'Part',
      });
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await expect(
        InspectionIssueMutationService.createIssue(mockUser, {
          defectSubcategoryId: 'sub-welding',
          processName: '外购件',
          responsibleWelder: '张三',
        }),
      ).resolves.toMatchObject({ ncNumber: 'NC-26KJ-005' });
    });
  });

  describe('updateIssue', () => {
    beforeEach(() => {
      (prisma.quality_records.findUnique as any).mockResolvedValue({
        inspection: null,
        supplierId: null,
        supplierName: null,
      });
      (prisma.quality_records.update as any).mockResolvedValue({
        id: 'rec-updated',
        supplierId: null,
        supplierName: null,
      });
    });

    it('should update the quality record', async () => {
      const { SystemLogService } = await import(
        '~/modules/system-log/system-log.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-1',
        {},
        null,
      );

      expect(prisma.quality_records.update).toHaveBeenCalledWith({
        where: {
          createdBy: 'user-1',
          id: 'rec-1',
          isDeleted: false,
        },
        data: { partName: 'Updated', responsibleWelderId: null },
      });
      expect(SystemLogService.auditLog).toHaveBeenCalled();
    });

    it('persists canonical responsibility identity on update', async () => {
      const { resolveInspectionIssueResponsibility } = await import(
        '~/modules/inspection/inspection-issue-responsibility.service'
      );
      await InspectionIssueMutationService.updateIssue(
        { id: 'user-1', username: 'admin', roles: [] } as any,
        'rec-1',
        {
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
        },
        null,
      );

      expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
        expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-assembly',
        }),
        expect.any(Object),
      );
      expect(prisma.quality_records.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responsibleDepartmentId: 'dept-assembly',
            responsibilityType: 'INTERNAL_DEPARTMENT',
          }),
        }),
      );
      expect(prisma.quality_records.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            responsibleDepartments: expect.anything(),
          }),
        }),
      );
    });

    it('rejects switching the defect subcategory to a welding defect without a welder', async () => {
      (
        prisma.quality_classification_subcategories.findFirst as any
      ).mockResolvedValue({
        code: 'WELDING_DEFECT',
        name: '焊接缺陷',
      });
      (prisma.quality_records.findUnique as any).mockResolvedValue({
        defectSubcategoryId: null,
        inspection: null,
        processName: '外购件',
        responsibleWelder: '',
        supplierId: null,
        supplierName: null,
      });
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await expect(
        InspectionIssueMutationService.updateIssue(
          mockUser,
          'rec-1',
          { defectSubcategoryId: 'sub-welding' },
          null,
        ),
      ).rejects.toThrow('焊接缺陷必须填写责任焊工');
      expect(prisma.quality_records.update).not.toHaveBeenCalled();
    });

    it('merges the current triad for a partial supplierId update', async () => {
      (prisma.quality_records.findUnique as any).mockResolvedValue({
        inspection: null,
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchase',
        supplierId: 'supplier-old',
        supplierName: 'Old Supplier',
      });
      const { resolveInspectionIssueResponsibility } = await import(
        '~/modules/inspection/inspection-issue-responsibility.service'
      );
      (resolveInspectionIssueResponsibility as any).mockResolvedValue({
        responsibleDepartment: 'Purchase',
        responsibleDepartmentId: 'dept-purchase',
        responsibilityType: 'SUPPLIER',
        supplierId: 'supplier-new',
        supplierName: 'New Supplier',
      });

      await InspectionIssueMutationService.updateIssue(
        { id: 'user-1', username: 'admin', roles: [] } as any,
        'rec-1',
        { supplierId: 'supplier-new' },
        null,
      );

      expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
        {
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchase',
          supplierId: 'supplier-new',
        },
        expect.any(Object),
      );
      expect(prisma.quality_records.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            responsibleDepartmentId: 'dept-purchase',
            responsibilityType: 'SUPPLIER',
          }),
        }),
      );
    });

    it('merges the current external supplier for a partial type update', async () => {
      (prisma.quality_records.findUnique as any).mockResolvedValue({
        inspection: null,
        responsibilityType: 'SUPPLIER',
        responsibleDepartmentId: 'dept-purchase',
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
      });
      const { resolveInspectionIssueResponsibility } = await import(
        '~/modules/inspection/inspection-issue-responsibility.service'
      );

      await InspectionIssueMutationService.updateIssue(
        { id: 'user-1', username: 'admin', roles: [] } as any,
        'rec-1',
        { responsibilityType: 'OUTSOURCING_UNIT' },
        null,
      );

      expect(resolveInspectionIssueResponsibility).toHaveBeenCalledWith(
        {
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-purchase',
          supplierId: 'supplier-1',
        },
        expect.any(Object),
      );
    });

    it('rejects updates when the current record already holds a welding defect without a welder', async () => {
      (
        prisma.quality_classification_subcategories.findFirst as any
      ).mockResolvedValue({
        code: 'WELDING_DEFECT',
        name: '焊接缺陷',
      });
      (prisma.quality_records.findUnique as any).mockResolvedValue({
        defectSubcategoryId: 'sub-welding',
        inspection: null,
        processName: '外购件',
        responsibleWelder: '',
        supplierId: null,
        supplierName: null,
      });
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await expect(
        InspectionIssueMutationService.updateIssue(
          mockUser,
          'rec-1',
          { partName: 'New Part' },
          null,
        ),
      ).rejects.toThrow('焊接缺陷必须填写责任焊工');
      expect(prisma.quality_records.update).not.toHaveBeenCalled();
    });

    it('should register photo references when photos provided in update', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-2',
        { photos: ['new-photo.jpg'] },
        'NC-26KJ-001',
      );

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).toHaveBeenCalledWith({
        attachments: ['new-photo.jpg'],
        bizId: 'rec-2',
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    });

    it('should not register photo references when photos is undefined', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-3',
        {},
        null,
      );

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).not.toHaveBeenCalled();
    });

    it('should enqueue a welder score refresh inside the update transaction', async () => {
      const { WelderScoreRefreshService } = await import('~/modules/welder');
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.update as any).mockResolvedValue({
        id: 'rec-5',
        partName: 'Updated',
        responsibleWelder: 'Alice',
      });

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-5',
        {},
        null,
      );

      expect(
        WelderScoreRefreshService.enqueueForResponsibleText,
      ).toHaveBeenCalled();
    });

    it('allows an admin to update a record created by another user', async () => {
      const mockUser = {
        id: 'admin-1',
        username: 'admin',
        roles: ['admin'],
      } as any;

      await InspectionIssueMutationService.updateIssue(
        mockUser,
        'rec-other',
        {},
        null,
      );

      expect(prisma.quality_records.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'rec-other',
          isDeleted: false,
        },
        select: {
          defectSubcategoryId: true,
          inspection: {
            select: { category: true, supplierId: true, teamId: true },
          },
          processName: true,
          responsibilityType: true,
          responsibleDepartmentId: true,
          responsibleWelder: true,
          supplierId: true,
          supplierName: true,
        },
      });
      expect(prisma.quality_records.update).toHaveBeenCalledWith({
        where: { id: 'rec-other', isDeleted: false },
        data: { partName: 'Updated', responsibleWelderId: null },
      });
    });
  });

  describe('batchDeleteIssues', () => {
    it('should soft delete records and return count', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const { InspectionIssueAccessService } = await import(
        '~/modules/inspection/inspection-issue-access.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { createdBy: 'user-1', id: 'rec-1', supplierName: null },
        { createdBy: 'user-1', id: 'rec-2', supplierName: null },
      ]);
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 2,
      });

      const result = await InspectionIssueMutationService.batchDeleteIssues(
        {} as any,
        mockUser,
        ['rec-1', 'rec-2'],
      );

      expect(result).toBe(2);
      expect(
        InspectionIssueAccessService.getAccessContext,
      ).toHaveBeenCalledWith(mockUser, 'QMS:Inspection:Issues:Delete');
      expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
        where: {
          createdBy: 'user-1',
          id: { in: ['rec-1', 'rec-2'] },
          isDeleted: false,
        },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      });
      expect(FileStorageService.softDeleteReferences).toHaveBeenCalledTimes(2);
    });

    it('should enqueue a welder score refresh inside the delete transaction', async () => {
      const { WelderScoreRefreshService } = await import('~/modules/welder');
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          createdBy: 'user-1',
          id: 'rec-3',
          responsibleWelder: 'Alice',
          supplierName: null,
        },
      ]);
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 0,
      });

      await InspectionIssueMutationService.batchDeleteIssues(
        {} as any,
        mockUser,
        ['rec-3'],
      );

      expect(
        WelderScoreRefreshService.enqueueForResponsibleText,
      ).toHaveBeenCalled();
    });

    it('should record audit log', async () => {
      const { recordBusinessAuditLog } = await import(
        '~/modules/system-log/audit-log'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { createdBy: 'user-1', id: 'rec-4', supplierName: null },
      ]);
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });

      await InspectionIssueMutationService.batchDeleteIssues(
        { node: { req: {} } } as any,
        mockUser,
        ['rec-4'],
      );

      expect(recordBusinessAuditLog).toHaveBeenCalledWith(
        { node: { req: {} } },
        expect.objectContaining({
          action: 'DELETE',
          targetType: 'inspection_issue',
        }),
      );
    });

    it('should reject the batch when the welder enqueue fails inside the transaction', async () => {
      const { WelderScoreRefreshService } = await import('~/modules/welder');
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;
      (prisma.quality_records.findMany as any).mockResolvedValue([
        {
          createdBy: 'user-1',
          id: 'rec-10',
          responsibleWelder: 'Alice',
          supplierName: null,
        },
      ]);
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 1,
      });
      const enqueueError = new Error('welder batch enqueue failed');
      vi.mocked(
        WelderScoreRefreshService.enqueueForResponsibleText,
      ).mockRejectedValue(enqueueError);

      await expect(
        InspectionIssueMutationService.batchDeleteIssues({} as any, mockUser, [
          'rec-10',
        ]),
      ).rejects.toBe(enqueueError);
    });

    it('rejects the whole batch when any record belongs to another user', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'inspector',
        roles: [],
      } as any;
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { createdBy: 'user-1', id: 'rec-1', supplierName: null },
        { createdBy: 'user-2', id: 'rec-2', supplierName: null },
      ]);

      await expect(
        InspectionIssueMutationService.batchDeleteIssues({} as any, mockUser, [
          'rec-1',
          'rec-2',
        ]),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });

      expect(prisma.quality_records.updateMany).not.toHaveBeenCalled();
    });

    it('allows an admin to delete records owned by other users', async () => {
      const mockUser = {
        id: 'admin-1',
        username: 'admin',
        roles: ['admin'],
      } as any;
      (prisma.quality_records.findMany as any).mockResolvedValue([
        { createdBy: 'system', id: 'rec-1', supplierName: null },
        { createdBy: 'user-2', id: 'rec-2', supplierName: null },
      ]);
      (prisma.quality_records.updateMany as any).mockResolvedValue({
        count: 2,
      });

      await InspectionIssueMutationService.batchDeleteIssues(
        {} as any,
        mockUser,
        ['rec-1', 'rec-2'],
      );

      expect(prisma.quality_records.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['rec-1', 'rec-2'] },
          isDeleted: false,
        },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      });
    });
  });

  describe('importIssues', () => {
    it('should import valid items and return summary', async () => {
      const { buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const { InspectionIssueAccessService } = await import(
        '~/modules/inspection/inspection-issue-access.service'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        partName: 'Part',
      } as any);
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 0,
        errors: [],
        successCount: 1,
        totalCount: 1,
      } as any);

      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ workOrderNumber: 'WO-1', partName: 'Part' }],
      );

      expect(result.successCount).toBe(1);
      expect(result.totalCount).toBe(1);
      expect(
        InspectionIssueAccessService.ensurePermission,
      ).toHaveBeenCalledWith(mockUser, 'QMS:Inspection:Issues:Create');
      expect(prisma.quality_records.create).toHaveBeenCalledWith({
        data: {
          nonConformanceNumber: null,
          partName: 'Part',
          responsibleWelderId: null,
        },
      });
    });

    it('should record row error when import payload construction fails', async () => {
      const { buildImportRowError, buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockRejectedValue(
        new Error('invalid import row'),
      );
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 1,
        errors: [{ reason: 'error', row: 1 }],
        successCount: 0,
        totalCount: 1,
      } as any);

      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ partName: 'Part' }],
      );

      expect(result.successCount).toBe(0);
      expect(buildImportRowError).toHaveBeenCalled();
    });

    it('should record row error when create throws', async () => {
      const { buildImportRowError, buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        partName: 'Part',
      } as any);
      (prisma.quality_records.create as any).mockRejectedValue(
        new Error('duplicate'),
      );
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 1,
        errors: [{ reason: 'error', row: 1 }],
        successCount: 0,
        totalCount: 1,
      } as any);

      await InspectionIssueMutationService.importIssues({} as any, mockUser, [
        { workOrderNumber: 'WO-1' },
      ]);

      expect(buildImportRowError).toHaveBeenCalled();
    });

    it('returns the import summary when a created import has no NC number', async () => {
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const { buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const mockUser = { id: 'user-1', username: 'admin', roles: [] } as any;

      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        partName: 'Part',
      } as any);
      (prisma.quality_records.create as any).mockResolvedValue({
        id: 'ISS-2026-010',
        supplierName: 'Supplier A',
      });
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 0,
        errors: [],
        successCount: 1,
        totalCount: 1,
      } as any);
      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ workOrderNumber: 'WO-2', partName: 'Part' }],
      );

      expect(result.successCount).toBe(1);
    });

    it('records a row error instead of overwriting another user record', async () => {
      const { buildImportRowError, buildImportSummary } = await import(
        '~/modules/file-storage/import-report'
      );
      const { buildInspectionIssueUpsertPayload } = await import(
        '~/modules/inspection/inspection-issue'
      );
      const mockUser = {
        id: 'admin-1',
        username: 'admin',
        roles: ['admin'],
      } as any;
      vi.mocked(buildInspectionIssueUpsertPayload).mockResolvedValue({
        partName: 'Part',
      } as any);
      (prisma.quality_records.findUnique as any).mockResolvedValue({
        createdBy: 'user-2',
        isDeleted: false,
      });
      vi.mocked(buildImportSummary).mockReturnValue({
        errorCount: 1,
        errors: [{ reason: 'error', row: 1 }],
        successCount: 0,
        totalCount: 1,
      } as any);

      const result = await InspectionIssueMutationService.importIssues(
        {} as any,
        mockUser,
        [{ ncNumber: 'NC-OTHER' }],
      );

      expect(result.successCount).toBe(0);
      expect(buildImportRowError).toHaveBeenCalled();
      expect(prisma.quality_records.create).not.toHaveBeenCalled();
      expect(prisma.quality_records.update).not.toHaveBeenCalled();
    });
  });
});
