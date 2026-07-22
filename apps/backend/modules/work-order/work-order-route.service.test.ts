import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderRouteService } from '~/modules/work-order/work-order-route.service';
import prisma from '~/utils/prisma';

const { mockBuildGovernedCanonicalWritePair } = vi.hoisted(() => ({
  mockBuildGovernedCanonicalWritePair: vi.fn(),
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/modules/work-order/work-order.service', () => ({
  WorkOrderService: {
    getList: vi.fn(),
  },
}));

vi.mock('~/modules/work-order/work-order-requirement-route.service', () => ({
  WorkOrderRequirementRouteService: {
    createRequirements: vi.fn(),
    getRequirementBoard: vi.fn(),
    getRequirements: vi.fn(),
    getWorkOrderAggregate: vi.fn(),
    updateRequirement: vi.fn(),
  },
}));

vi.mock('~/modules/system-log/audit-log', () => ({
  recordBusinessAuditLog: vi.fn(),
}));

vi.mock('~/modules/work-order/work-order-query', () => ({
  parseOptionalDate: (v: unknown) => (v ? new Date(v as string) : null),
  parseRequiredDate: (v: unknown) => new Date((v as string) || '2024-01-01'),
  parseRequiredWorkOrderNumber: (v: unknown) => (v ? String(v) : ''),
  parseWorkOrderListQuery: (query: any) => ({
    page: Number(query.page) || 1,
    pageSize: Number(query.pageSize) || 20,
    search: query.search || '',
  }),
  parseWorkOrderQuantity: (v: unknown, fallback: number) =>
    Number(v) || fallback,
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: mockBuildGovernedCanonicalWritePair,
  buildGovernedWriteFieldsForTable: (_table: string, fields: any) => fields,
}));

vi.mock('~/modules/work-order/work-order-status', () => ({
  mapWorkOrderStatus: (s: unknown) => String(s || 'OPEN'),
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaNotFoundError: (e: any) => e?.message === 'NOT_FOUND',
  isPrismaRequiredValueError: (e: any) => e?.message === 'REQUIRED',
  isPrismaUniqueConflictError: (e: any) => e?.message === 'UNIQUE',
}));

vi.mock('~/modules/file-storage/import-report', () => ({
  buildImportRowError: (opts: any) => ({
    field: opts.field,
    message: opts.reason,
    row: opts.row,
  }),
  buildImportSummary: (opts: any) => ({
    errorCount: opts.rowErrors.length,
    errors: opts.rowErrors,
    successCount: opts.successCount,
    totalCount: opts.totalCount,
  }),
  inferImportErrorField: (msg: string) =>
    msg.includes('工单号') ? 'workOrderNumber' : 'unknown',
  toImportErrorMessage: (e: any) => String(e?.message || 'Unknown error'),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
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

describe('workOrderRouteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildGovernedCanonicalWritePair.mockResolvedValue({});
  });

  describe('batchDelete', () => {
    it('should soft delete multiple work orders', async () => {
      (prisma.work_orders.updateMany as any).mockResolvedValue({ count: 2 });

      const result = await WorkOrderRouteService.batchDelete(
        mockEvent(),
        ['WO-001', 'WO-002'],
        mockUserinfo(),
      );

      expect(result.successCount).toBe(2);
      expect(prisma.work_orders.updateMany).toHaveBeenCalledWith({
        where: {
          workOrderNumber: { in: ['WO-001', 'WO-002'] },
          isDeleted: false,
        },
        data: expect.objectContaining({ isDeleted: true }),
      });
    });
  });

  describe('deleteById', () => {
    it('should soft delete single work order', async () => {
      (prisma.work_orders.update as any).mockResolvedValue({
        customerName: 'C1',
        workOrderNumber: 'WO-001',
      });

      const result = await WorkOrderRouteService.deleteById(
        mockEvent(),
        'WO-001',
        mockUserinfo(),
      );

      expect(result).toBeNull();
    });

    it('should throw BusinessError when not found', async () => {
      const error = new Error('NOT_FOUND');
      (prisma.work_orders.update as any).mockRejectedValue(error);

      await expect(
        WorkOrderRouteService.deleteById(
          mockEvent(),
          'WO-MISS',
          mockUserinfo(),
        ),
      ).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('should create new work order', async () => {
      (prisma.work_orders.findUnique as any).mockResolvedValue(null);
      (prisma.work_orders.create as any).mockResolvedValue({
        workOrderNumber: 'WO-NEW',
        customerName: 'Customer',
        projectName: 'Project',
        division: 'Div',
        quantity: 10,
        status: 'OPEN',
        createdAt: new Date('2024-01-01'),
        multiStationEnabled: false,
        effectiveTime: null,
      });

      const result = await WorkOrderRouteService.create(
        mockEvent(),
        {
          workOrderNumber: 'WO-NEW',
          customerName: 'Customer',
          projectName: 'Project',
          division: 'Div',
          quantity: 10,
          deliveryDate: '2024-06-01',
          status: 'OPEN',
        },
        mockUserinfo(),
      );

      expect(result.id).toBe('WO-NEW');
      expect(result.createTime).toBeDefined();
      expect(prisma.work_orders.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isDeleted: false,
            workOrderNumber: 'WO-NEW',
          }),
        }),
      );
    });

    it('resolves a department ID into division ID and name on create', async () => {
      mockBuildGovernedCanonicalWritePair.mockResolvedValue({
        division: 'Vehicle OBU',
        divisionId: 'dept-vehicle',
      });
      (prisma.work_orders.findUnique as any).mockResolvedValue(null);
      (prisma.work_orders.create as any).mockResolvedValue({
        createdAt: new Date('2024-01-01'),
        customerName: 'Customer',
        division: 'Vehicle OBU',
        divisionId: 'dept-vehicle',
        workOrderNumber: 'WO-DIVISION',
      });

      await WorkOrderRouteService.create(
        mockEvent(),
        {
          customerName: 'Customer',
          deliveryDate: '2024-06-01',
          division: 'dept-vehicle',
          workOrderNumber: 'WO-DIVISION',
        },
        mockUserinfo(),
      );

      expect(mockBuildGovernedCanonicalWritePair).toHaveBeenCalledWith(
        'work_orders',
        expect.objectContaining({ division: 'dept-vehicle' }),
      );
      expect(prisma.work_orders.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          division: 'Vehicle OBU',
          divisionId: 'dept-vehicle',
        }),
      });
    });

    it('should restore a deleted work order instead of failing on the primary key', async () => {
      (prisma.work_orders.findUnique as any).mockResolvedValue({
        isDeleted: true,
        workOrderNumber: 'WO-DELETED',
      });
      (prisma.work_orders.update as any).mockResolvedValue({
        workOrderNumber: 'WO-DELETED',
        customerName: 'Customer',
        projectName: 'Project',
        division: 'Div',
        quantity: 10,
        status: 'OPEN',
        createdAt: new Date('2024-01-01'),
        multiStationEnabled: false,
        effectiveTime: null,
      });

      const result = await WorkOrderRouteService.create(
        mockEvent(),
        {
          workOrderNumber: 'WO-DELETED',
          customerName: 'Customer',
          projectName: 'Project',
          division: 'Div',
          quantity: 10,
          deliveryDate: '2024-06-01',
          status: 'OPEN',
        },
        mockUserinfo(),
      );

      expect(result.id).toBe('WO-DELETED');
      expect(prisma.work_orders.create).not.toHaveBeenCalled();
      expect(prisma.work_orders.update).toHaveBeenCalledWith({
        where: { workOrderNumber: 'WO-DELETED' },
        data: expect.objectContaining({
          customerName: 'Customer',
          isDeleted: false,
        }),
      });
    });

    it('should throw on active duplicate work order number', async () => {
      (prisma.work_orders.findUnique as any).mockResolvedValue({
        isDeleted: false,
        workOrderNumber: 'WO-EXIST',
      });

      await expect(
        WorkOrderRouteService.create(
          mockEvent(),
          { workOrderNumber: 'WO-EXIST', customerName: 'C' },
          mockUserinfo(),
        ),
      ).rejects.toThrow('已存在且未删除');
      expect(prisma.work_orders.create).not.toHaveBeenCalled();
      expect(prisma.work_orders.update).not.toHaveBeenCalled();
    });

    it('should throw on missing required fields', async () => {
      await expect(
        WorkOrderRouteService.create(
          mockEvent(),
          { workOrderNumber: '' },
          mockUserinfo(),
        ),
      ).rejects.toThrow('缺少必填字段');
    });
  });

  describe('update', () => {
    it('should update work order fields', async () => {
      (prisma.work_orders.update as any).mockResolvedValue({
        customerName: 'Updated',
        workOrderNumber: 'WO-001',
      });

      const result = await WorkOrderRouteService.update(
        mockEvent(),
        'WO-001',
        { customerName: 'Updated', quantity: 50 },
        mockUserinfo(),
      );

      expect(result).toBeNull();
      expect(prisma.work_orders.update).toHaveBeenCalled();
    });

    it('resolves a department ID into division ID and name on update', async () => {
      mockBuildGovernedCanonicalWritePair.mockResolvedValue({
        division: 'Bridge OBU',
        divisionId: 'dept-bridge',
      });
      (prisma.work_orders.update as any).mockResolvedValue({
        customerName: 'Customer',
        workOrderNumber: 'WO-001',
      });

      await WorkOrderRouteService.update(
        mockEvent(),
        'WO-001',
        { division: 'dept-bridge' },
        mockUserinfo(),
      );

      expect(prisma.work_orders.update).toHaveBeenCalledWith({
        data: expect.objectContaining({
          division: 'Bridge OBU',
          divisionId: 'dept-bridge',
        }),
        where: { workOrderNumber: 'WO-001' },
      });
    });

    it('should throw when work order not found', async () => {
      const error = new Error('NOT_FOUND');
      (prisma.work_orders.update as any).mockRejectedValue(error);

      await expect(
        WorkOrderRouteService.update(
          mockEvent(),
          'WO-MISS',
          { customerName: 'X' },
          mockUserinfo(),
        ),
      ).rejects.toThrow();
    });
  });

  describe('importRows', () => {
    it('should upsert rows and return summary', async () => {
      (prisma.work_orders.upsert as any).mockResolvedValue({});

      const result = await WorkOrderRouteService.importRows(
        mockEvent(),
        [
          { workOrderNumber: 'WO-IMP-1', customerName: 'C1', quantity: 10 },
          { workOrderNumber: 'WO-IMP-2', customerName: 'C2', quantity: 20 },
        ],
        mockUserinfo(),
      );

      expect(result.successCount).toBe(2);
      expect(result.totalCount).toBe(2);
    });

    it('resolves canonical division fields for legacy imports', async () => {
      mockBuildGovernedCanonicalWritePair.mockResolvedValue({
        division: 'Vehicle OBU',
        divisionId: 'dept-vehicle',
      });
      (prisma.work_orders.upsert as any).mockResolvedValue({});

      await WorkOrderRouteService.importRows(
        mockEvent(),
        [
          {
            customerName: 'Customer',
            division: 'dept-vehicle',
            workOrderNumber: 'WO-IMPORT-DIVISION',
          },
        ],
        mockUserinfo(),
      );

      expect(mockBuildGovernedCanonicalWritePair).toHaveBeenCalledWith(
        'work_orders',
        expect.objectContaining({ division: 'dept-vehicle' }),
        { mode: 'legacy-import' },
      );
      expect(prisma.work_orders.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            division: 'Vehicle OBU',
            divisionId: 'dept-vehicle',
          }),
          update: expect.objectContaining({
            division: 'Vehicle OBU',
            divisionId: 'dept-vehicle',
          }),
        }),
      );
    });

    it('should handle row errors gracefully', async () => {
      (prisma.work_orders.upsert as any)
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await WorkOrderRouteService.importRows(
        mockEvent(),
        [
          { workOrderNumber: 'WO-OK', customerName: 'C1' },
          { workOrderNumber: 'WO-FAIL', customerName: 'C2' },
        ],
        mockUserinfo(),
      );

      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should skip rows with empty work order number', async () => {
      const result = await WorkOrderRouteService.importRows(
        mockEvent(),
        [{ workOrderNumber: '', customerName: 'C' }],
        mockUserinfo(),
      );

      expect(result.successCount).toBe(0);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('exportList', () => {
    it('should export work order list', async () => {
      const { WorkOrderService } = await import(
        '~/modules/work-order/work-order.service'
      );
      (WorkOrderService.getList as any).mockResolvedValue({
        items: [{ id: 'WO-1' }],
        total: 1,
      });

      const result = await WorkOrderRouteService.exportList(
        mockEvent(),
        { page: 1, pageSize: 10 },
        mockUserinfo(),
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw when export exceeds limit', async () => {
      const { WorkOrderService } = await import(
        '~/modules/work-order/work-order.service'
      );
      (WorkOrderService.getList as any).mockResolvedValue({
        items: [],
        total: 25_000,
      });

      await expect(
        WorkOrderRouteService.exportList(
          mockEvent(),
          { page: 1, pageSize: 10 },
          mockUserinfo(),
        ),
      ).rejects.toThrow('导出数据量超过上限');
    });
  });
});
