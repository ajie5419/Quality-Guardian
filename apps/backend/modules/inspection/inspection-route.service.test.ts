import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionRouteService } from '~/modules/inspection/inspection-route.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspection_form_templates: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/modules/inspection/inspection-request-close.service', () => ({
  InspectionRequestCloseService: {
    closeRequest: vi.fn().mockResolvedValue({ closed: true }),
  },
}));

vi.mock('~/modules/inspection/inspection-request-stats.service', () => ({
  InspectionRequestStatsService: {
    getRequestStats: vi.fn().mockResolvedValue({ total: 0 }),
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: vi.fn().mockReturnValue({}),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn().mockReturnValue('Welding'),
  resolveProcessIdForWrite: vi.fn().mockResolvedValue('pid-1'),
}));

vi.mock('~/modules/inspection/inspection-form', () => ({
  buildInspectionFormProcessFilter: vi.fn().mockResolvedValue({}),
}));

describe('inspectionRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('closeRequest', () => {
    it('should delegate to InspectionRequestCloseService', async () => {
      const { InspectionRequestCloseService } = await import(
        '~/modules/inspection/inspection-request-close.service'
      );
      const event = {} as any;
      const userinfo = { username: 'admin' } as any;

      const result = await InspectionRouteService.closeRequest(
        event,
        'id-1',
        {},
        userinfo,
      );

      expect(InspectionRequestCloseService.closeRequest).toHaveBeenCalledWith(
        event,
        'id-1',
        {},
        userinfo,
      );
      expect(result).toEqual({ closed: true });
    });
  });

  describe('getRequestStats', () => {
    it('should delegate to InspectionRequestStatsService', async () => {
      const { InspectionRequestStatsService } = await import(
        '~/modules/inspection/inspection-request-stats.service'
      );

      const result = await InspectionRouteService.getRequestStats({
        period: 'week',
      });

      expect(
        InspectionRequestStatsService.getRequestStats,
      ).toHaveBeenCalledWith({ period: 'week' });
      expect(result).toEqual({ total: 0 });
    });
  });

  describe('updateInspectionFormTemplate', () => {
    it('should throw NOT_FOUND when template does not exist', async () => {
      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        null,
      );

      await expect(
        InspectionRouteService.updateInspectionFormTemplate(
          't-1',
          {},
          {
            username: 'admin',
          },
        ),
      ).rejects.toThrow('NOT_FOUND:检验表不存在');
    });

    it('should update template with provided fields', async () => {
      const current = {
        id: 't-1',
        partName: 'Part A',
        processId: 'pid-old',
        process: { name: 'Welding' },
        processName: 'Welding',
        status: 'active',
        workOrderNumber: 'WO-001',
      };
      const updated = { id: 't-1', formName: 'New Form' };

      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        current,
      );
      (prisma.inspection_form_templates.findFirst as any).mockResolvedValue(
        null,
      );
      (prisma.inspection_form_templates.update as any).mockResolvedValue(
        updated,
      );

      const result = await InspectionRouteService.updateInspectionFormTemplate(
        't-1',
        { formName: 'New Form' },
        { username: 'admin' },
      );

      expect(prisma.inspection_form_templates.update).toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should throw CONFLICT when duplicate active template exists', async () => {
      const current = {
        id: 't-1',
        partName: 'Part A',
        processId: 'pid-old',
        process: { name: 'Welding' },
        processName: 'Welding',
        status: 'active',
        workOrderNumber: 'WO-001',
      };

      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        current,
      );
      (prisma.inspection_form_templates.findFirst as any).mockResolvedValue({
        id: 't-dup',
      });

      await expect(
        InspectionRouteService.updateInspectionFormTemplate(
          't-1',
          { workOrderNumber: 'WO-001', processName: 'Welding' },
          { username: 'admin' },
        ),
      ).rejects.toThrow('CONFLICT');
    });

    it('should skip duplicate check when status is not active', async () => {
      const current = {
        id: 't-1',
        partName: 'Part A',
        processId: 'pid-old',
        process: { name: 'Welding' },
        processName: 'Welding',
        status: 'inactive',
        workOrderNumber: 'WO-001',
      };
      const updated = { id: 't-1' };

      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        current,
      );
      (prisma.inspection_form_templates.update as any).mockResolvedValue(
        updated,
      );

      const result = await InspectionRouteService.updateInspectionFormTemplate(
        't-1',
        { status: 'inactive' },
        { username: 'admin' },
      );

      expect(prisma.inspection_form_templates.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual(updated);
    });

    it('should normalize templateQuantity to null for non-positive values', async () => {
      const current = {
        id: 't-1',
        partName: null,
        processId: null,
        process: null,
        processName: null,
        status: 'active',
        workOrderNumber: 'WO-001',
      };

      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        current,
      );
      (prisma.inspection_form_templates.findFirst as any).mockResolvedValue(
        null,
      );
      (prisma.inspection_form_templates.update as any).mockResolvedValue({});

      await InspectionRouteService.updateInspectionFormTemplate(
        't-1',
        { templateQuantity: 0 },
        { username: 'admin' },
      );

      const callArgs = (prisma.inspection_form_templates.update as any).mock
        .calls[0][0];
      expect(callArgs.data.templateQuantity).toBeNull();
    });

    it('should truncate templateQuantity to integer', async () => {
      const current = {
        id: 't-1',
        partName: null,
        processId: null,
        process: null,
        processName: null,
        status: 'active',
        workOrderNumber: 'WO-001',
      };

      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        current,
      );
      (prisma.inspection_form_templates.findFirst as any).mockResolvedValue(
        null,
      );
      (prisma.inspection_form_templates.update as any).mockResolvedValue({});

      await InspectionRouteService.updateInspectionFormTemplate(
        't-1',
        { templateQuantity: 3.7 },
        { username: 'admin' },
      );

      const callArgs = (prisma.inspection_form_templates.update as any).mock
        .calls[0][0];
      expect(callArgs.data.templateQuantity).toBe(3);
    });

    it('should register file references when attachments change', async () => {
      const { FileStorageService } = await import(
        '~/modules/file-storage/file-storage.service'
      );
      const current = {
        id: 't-1',
        partName: null,
        processId: null,
        process: null,
        processName: null,
        status: 'active',
        workOrderNumber: 'WO-001',
      };

      (prisma.inspection_form_templates.findUnique as any).mockResolvedValue(
        current,
      );
      (prisma.inspection_form_templates.findFirst as any).mockResolvedValue(
        null,
      );
      (prisma.inspection_form_templates.update as any).mockResolvedValue({});

      await InspectionRouteService.updateInspectionFormTemplate(
        't-1',
        { attachments: 'file1.pdf' },
        { username: 'admin' },
      );

      expect(
        FileStorageService.registerReferencesFromAttachments,
      ).toHaveBeenCalledWith({
        attachments: 'file1.pdf',
        bizId: 't-1',
        bizType: 'inspection_form_template',
      });
    });
  });
});
