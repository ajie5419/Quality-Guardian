import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderRequirementRouteService } from '~/modules/work-order/work-order-requirement-route.service';

vi.mock(
  '~/modules/work-order-requirement/work-order-requirement.service',
  () => ({
    WorkOrderRequirementService: {
      createMany: vi.fn(),
      findActiveByWorkOrder: vi.fn(),
      getRequirementBoard: vi.fn(),
      registerAttachmentReferences: vi.fn(),
      updateById: vi.fn(),
    },
  }),
);

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
  buildGovernedWriteFieldsForTable: (_table: string, fields: any) => fields,
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: (item: any) => item.processName || '',
}));

vi.mock('./work-order-aggregate.service', () => ({
  WorkOrderAggregateService: {
    getWorkOrderAggregate: vi.fn().mockResolvedValue({ summary: {} }),
  },
}));

vi.mock('./work-order-requirement-attachments', () => ({
  parseRequirementAttachments: (attachment: unknown) => {
    if (typeof attachment === 'string') {
      try {
        return JSON.parse(attachment);
      } catch {
        return [];
      }
    }
    return Array.isArray(attachment) ? attachment : [];
  },
}));

vi.mock('~/modules/work-order/work-order-query', () => ({
  parseWorkOrderListQuery: (query: any) => ({
    page: Number(query.page) || 1,
    pageSize: Number(query.pageSize) || 20,
    search: query.search || '',
  }),
}));

function mockEvent() {
  return {
    path: '/api/test',
    context: { requestId: 'r1', traceId: 't1' },
  } as any;
}

function mockUserinfo() {
  return { id: 'u1', username: 'admin' } as any;
}

describe('workOrderRequirementRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createRequirements', () => {
    it('should create multiple requirements', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.createMany as any).mockResolvedValue([
        { id: 'new-1', workOrderNumber: 'WO-001', requirementName: 'Req1' },
      ]);
      (
        WorkOrderRequirementService.registerAttachmentReferences as any
      ).mockResolvedValue(undefined);

      const result = await WorkOrderRequirementRouteService.createRequirements(
        mockEvent(),
        [
          {
            partName: 'Frame',
            processName: 'Welding',
            requirementName: 'Quality',
            workOrderNumber: 'WO-001',
            items: [{ a: 1 }],
            attachments: [],
            responsiblePerson: 'John',
            responsibleTeam: 'Team A',
          },
        ],
        mockUserinfo(),
      );

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(
        WorkOrderRequirementService.registerAttachmentReferences,
      ).toHaveBeenCalled();
    });
  });

  describe('updateRequirement', () => {
    it('should update requirement with confirm flag', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.updateById as any).mockResolvedValue({
        id: 'req-1',
        workOrderNumber: 'WO-001',
        requirementName: 'Updated',
      });

      const result = await WorkOrderRequirementRouteService.updateRequirement(
        mockEvent(),
        'req-1',
        { confirm: true, requirementName: 'Updated' },
        mockUserinfo(),
      );

      expect(result.id).toBe('req-1');
      expect(WorkOrderRequirementService.updateById).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({
          confirmStatus: 'CONFIRMED',
          confirmer: 'admin',
        }),
      );
    });

    it('should update requirement without confirm', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.updateById as any).mockResolvedValue({
        id: 'req-1',
        workOrderNumber: 'WO-001',
        requirementName: 'Updated',
      });

      await WorkOrderRequirementRouteService.updateRequirement(
        mockEvent(),
        'req-1',
        { requirementName: 'Updated' },
        mockUserinfo(),
      );

      expect(WorkOrderRequirementService.updateById).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({
          confirmStatus: 'PENDING',
          confirmer: null,
        }),
      );
    });
  });

  describe('getRequirements', () => {
    it('should return formatted requirements', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (
        WorkOrderRequirementService.findActiveByWorkOrder as any
      ).mockResolvedValue([
        {
          id: 'req-1',
          workOrderNumber: 'WO-001',
          partName: 'Frame',
          processName: 'Welding',
          requirementName: 'Quality',
          requirementItems: '[{"a":1}]',
          attachment: '[]',
          confirmStatus: 'CONFIRMED',
          confirmer: 'admin',
          confirmedAt: new Date(),
          createdAt: new Date(),
          responsiblePerson: 'John',
          responsibleTeam: 'Team A',
        },
      ]);

      const result =
        await WorkOrderRequirementRouteService.getRequirements('WO-001');

      expect(result).toHaveLength(1);
      expect(result[0].partName).toBe('Frame');
      expect(result[0].confirmStatus).toBe('CONFIRMED');
    });
  });

  describe('getRequirementBoard', () => {
    it('should return board with filter', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (
        WorkOrderRequirementService.getRequirementBoard as any
      ).mockResolvedValue({
        items: [
          {
            id: 'r1',
            workOrderNumber: 'WO-001',
            partName: 'Frame',
            processName: 'Welding',
            requirementName: 'Quality',
            confirmStatus: 'PENDING',
            confirmer: null,
            confirmedAt: null,
            createdAt: new Date(),
            responsiblePerson: '',
            responsibleTeam: '',
            attachment: null,
            work_order: {
              customerName: 'C1',
              division: 'D1',
              projectName: 'P1',
              status: 'OPEN',
            },
          },
        ],
        total: 1,
      });

      const result = await WorkOrderRequirementRouteService.getRequirementBoard(
        { filter: 'pending' },
        mockUserinfo(),
      );

      expect(result.total).toBe(1);
      expect(result.items[0].customerName).toBe('C1');
    });
  });

  describe('getWorkOrderAggregate', () => {
    it('should delegate to aggregate service', async () => {
      const { WorkOrderAggregateService } = await import(
        '~/modules/work-order/work-order-aggregate.service'
      );

      await WorkOrderRequirementRouteService.getWorkOrderAggregate('WO-001');

      expect(
        WorkOrderAggregateService.getWorkOrderAggregate,
      ).toHaveBeenCalledWith('WO-001');
    });
  });
});
