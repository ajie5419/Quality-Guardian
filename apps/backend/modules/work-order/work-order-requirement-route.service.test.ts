import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacService } from '~/modules/rbac';
import { WorkOrderRequirementRouteService } from '~/modules/work-order/work-order-requirement-route.service';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';

vi.mock('~/modules/rbac', () => ({
  RbacService: {
    getUserPermissionCodes: vi
      .fn()
      .mockResolvedValue([
        'QMS:WorkOrder:Create',
        'QMS:WorkOrder:Confirm',
        'QMS:WorkOrder:Delete',
        'QMS:WorkOrder:Edit',
      ]),
  },
}));

vi.mock('~/modules/data-scope', () => ({
  DataScopeService: {
    buildWorkOrderWhere: vi.fn(async (where) => where),
    getScopeForModule: vi.fn(async () => ({ deptIds: [], scopeType: 'ALL' })),
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $transaction: vi.fn(async (callback) =>
      callback({
        work_orders: { count: vi.fn().mockResolvedValue(1) },
      }),
    ),
  },
}));

vi.mock(
  '~/modules/work-order-requirement/work-order-requirement.service',
  () => ({
    WorkOrderRequirementService: {
      createMany: vi.fn(),
      findActiveMutationState: vi.fn(),
      findActiveByWorkOrder: vi.fn(),
      getRequirementBoard: vi.fn(),
      registerAttachmentReferences: vi.fn(),
      softDeleteAttachmentReferences: vi.fn(),
      softDeleteById: vi.fn(),
      updateActiveById: vi.fn(),
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

vi.mock('~/utils/canonical-master-data', () => ({
  MasterDataGovernanceKernel: {
    resolveCanonicalNameById: vi.fn(({ configKey }: { configKey: string }) =>
      Promise.resolve(
        configKey === 'partName' ? 'Canonical Part' : 'Canonical Process',
      ),
    ),
  },
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
    context: {
      dataScope: { deptIds: [], scopeType: 'ALL' },
      requestId: 'r1',
      traceId: 't1',
    },
  } as any;
}

function mockSelfScopedEvent() {
  return {
    path: '/api/test',
    context: {
      dataScope: { deptIds: [], scopeType: 'SELF' },
      requestId: 'r1',
      traceId: 't1',
    },
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
      vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValue({
        responsibleTeamId: 'team-1',
      });

      const result = await WorkOrderRequirementRouteService.createRequirements(
        mockEvent(),
        [
          {
            identityContractVersion: 2,
            partId: 'part-1',
            processId: 'process-1',
            requirementName: 'Quality',
            workOrderNumber: 'WO-001',
            items: [{ a: 1 }],
            attachments: [],
            responsiblePerson: 'John',
            responsibleTeam: 'Team A',
            responsibleTeamId: 'team-1',
          },
        ],
        mockUserinfo(),
      );

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(1);
      expect(
        WorkOrderRequirementService.registerAttachmentReferences,
      ).toHaveBeenCalled();
      expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
        'work_order_requirements',
        expect.objectContaining({
          responsibleTeam: 'Team A',
          responsibleTeamId: 'team-1',
        }),
      );
      expect(WorkOrderRequirementService.createMany).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            responsibleTeam: 'Team A',
            responsibleTeamId: 'team-1',
          }),
        ],
        expect.any(Object),
      );
    });

    it('should reject creation without work order create permission', async () => {
      vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValueOnce([]);

      await expect(
        WorkOrderRequirementRouteService.createRequirements(
          mockEvent(),
          [{ requirementName: 'Quality', workOrderNumber: 'WO-001' }],
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('should reject name-only creation through a direct service call', async () => {
      await expect(
        WorkOrderRequirementRouteService.createRequirements(
          mockEvent(),
          [{ requirementName: 'Quality', workOrderNumber: 'WO-001' }],
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({
        code: 'IDENTITY_CONTRACT_V2_REQUIRED',
        httpStatus: 400,
      });
    });

    it('rebuilds V2 names from canonical IDs', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.createMany as any).mockResolvedValue([
        { id: 'new-1', workOrderNumber: 'WO-001', requirementName: 'Req1' },
      ]);
      vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValue({
        partId: 'part-1',
        processId: 'process-1',
      });

      await WorkOrderRequirementRouteService.createRequirements(
        mockEvent(),
        [
          {
            identityContractVersion: 2,
            partId: 'part-1',
            processId: 'process-1',
            requirementName: 'Quality',
            workOrderNumber: 'WO-001',
          },
        ],
        mockUserinfo(),
      );

      expect(WorkOrderRequirementService.createMany).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            partId: 'part-1',
            partName: 'Canonical Part',
            processId: 'process-1',
            processName: 'Canonical Process',
          }),
        ],
        expect.any(Object),
      );
    });

    it('should reject creation when self scope has no department fallback', async () => {
      await expect(
        WorkOrderRequirementRouteService.createRequirements(
          mockSelfScopedEvent(),
          [
            {
              identityContractVersion: 2,
              requirementName: 'Quality',
              workOrderNumber: 'WO-001',
            },
          ],
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });
  });

  describe('updateRequirement', () => {
    it('allows confirmation with confirm permission but no edit permission', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValueOnce([
        'QMS:WorkOrder:Confirm',
      ]);
      (WorkOrderRequirementService.updateActiveById as any).mockResolvedValue({
        id: 'req-1',
        workOrderNumber: 'WO-001',
        requirementName: 'Updated',
      });
      vi.mocked(buildGovernedCanonicalWritePairForTable).mockResolvedValue({
        responsibleTeamId: 'team-1',
      });

      const result = await WorkOrderRequirementRouteService.updateRequirement(
        mockEvent(),
        'req-1',
        {
          confirm: true,
        },
        mockUserinfo(),
      );

      expect(result.id).toBe('req-1');
      expect(RbacService.getUserPermissionCodes).toHaveBeenCalledWith('u1');
      expect(WorkOrderRequirementService.updateActiveById).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            confirmStatus: 'CONFIRMED',
            confirmer: 'admin',
          }),
          expectedConfirmStatus: 'PENDING',
          id: 'req-1',
        }),
        expect.any(Object),
      );
    });

    it('rejects confirmation with edit permission but no confirm permission', async () => {
      vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValueOnce([
        'QMS:WorkOrder:Edit',
      ]);

      await expect(
        WorkOrderRequirementRouteService.updateRequirement(
          mockEvent(),
          'req-1',
          { confirm: true },
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('allows ordinary edits with edit permission but no confirm permission', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValueOnce([
        'QMS:WorkOrder:Edit',
      ]);
      (WorkOrderRequirementService.updateActiveById as any).mockResolvedValue({
        id: 'req-1',
        workOrderNumber: 'WO-001',
        requirementName: 'Updated',
      });

      await WorkOrderRequirementRouteService.updateRequirement(
        mockEvent(),
        'req-1',
        { identityContractVersion: 2, requirementName: 'Updated' },
        mockUserinfo(),
      );

      expect(WorkOrderRequirementService.updateActiveById).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            confirmStatus: expect.anything(),
            confirmer: expect.anything(),
          }),
          expectedConfirmStatus: undefined,
          id: 'req-1',
        }),
        expect.any(Object),
      );
    });

    it('rejects ordinary edits with confirm permission but no edit permission', async () => {
      vi.mocked(RbacService.getUserPermissionCodes).mockResolvedValueOnce([
        'QMS:WorkOrder:Confirm',
      ]);

      await expect(
        WorkOrderRequirementRouteService.updateRequirement(
          mockEvent(),
          'req-1',
          { identityContractVersion: 2, requirementName: 'Updated' },
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('should reject name-only edits through a direct service call', async () => {
      await expect(
        WorkOrderRequirementRouteService.updateRequirement(
          mockEvent(),
          'req-1',
          { requirementName: 'Updated' },
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({
        code: 'IDENTITY_CONTRACT_V2_REQUIRED',
        httpStatus: 400,
      });
    });

    it('should report a stale confirmation state as a conflict', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.updateActiveById as any).mockResolvedValue(
        null,
      );
      (
        WorkOrderRequirementService.findActiveMutationState as any
      ).mockResolvedValue({ confirmStatus: 'CONFIRMED', id: 'req-1' });

      await expect(
        WorkOrderRequirementRouteService.updateRequirement(
          mockEvent(),
          'req-1',
          { confirm: true },
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'STATE_CONFLICT', httpStatus: 409 });
    });

    it('should reject edits when self scope has no department fallback', async () => {
      await expect(
        WorkOrderRequirementRouteService.updateRequirement(
          mockSelfScopedEvent(),
          'req-1',
          { identityContractVersion: 2, requirementName: 'Updated' },
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
    });

    it('should clear canonical identities by ID', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.updateActiveById as any).mockResolvedValue({
        id: 'req-1',
        workOrderNumber: 'WO-001',
        requirementName: 'Updated',
      });

      await WorkOrderRequirementRouteService.updateRequirement(
        mockEvent(),
        'req-1',
        {
          identityContractVersion: 2,
          partId: null,
          processId: null,
        },
        mockUserinfo(),
      );

      expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
        'work_order_requirements',
        expect.objectContaining({ partId: null, processId: null }),
      );
    });
  });

  describe('deleteRequirement', () => {
    it('should soft delete a scoped requirement and its attachments', async () => {
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      (WorkOrderRequirementService.softDeleteById as any).mockResolvedValue({
        count: 1,
      });

      await WorkOrderRequirementRouteService.deleteRequirement(
        mockEvent(),
        'req-1',
        mockUserinfo(),
      );

      expect(WorkOrderRequirementService.softDeleteById).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1', updatedBy: 'admin' }),
        expect.any(Object),
      );
      expect(
        WorkOrderRequirementService.softDeleteAttachmentReferences,
      ).toHaveBeenCalledWith('req-1', expect.any(Object));
    });

    it('should reject deletion when self scope has no department fallback', async () => {
      await expect(
        WorkOrderRequirementRouteService.deleteRequirement(
          mockSelfScopedEvent(),
          'req-1',
          mockUserinfo(),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', httpStatus: 403 });
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
