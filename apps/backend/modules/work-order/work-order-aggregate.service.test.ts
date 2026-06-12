import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderAggregateService } from '~/modules/work-order/work-order-aggregate.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock(
  '~/modules/work-order-requirement/work-order-requirement.service',
  () => ({
    WorkOrderRequirementService: {
      findActiveForAggregate: vi.fn(),
    },
  }),
);

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getWorkOrderAggregateInspections: vi.fn(),
  },
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: (item: any) => item.processName || '',
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

describe('workOrderAggregateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWorkOrderAggregate', () => {
    it('should return empty aggregate when no work order found', async () => {
      (prisma.work_orders.findFirst as any).mockResolvedValue(null);
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      const { InspectionService } = await import('~/modules/inspection');
      (
        WorkOrderRequirementService.findActiveForAggregate as any
      ).mockResolvedValue([]);
      (
        InspectionService.getWorkOrderAggregateInspections as any
      ).mockResolvedValue([]);

      const result =
        await WorkOrderAggregateService.getWorkOrderAggregate('WO-001');

      expect(result.workOrder.workOrderNumber).toBe('WO-001');
      expect(result.summary.plannedPoints).toBe(0);
      expect(result.summary.completionRate).toBe(0);
      expect(result.requirements).toHaveLength(0);
    });

    it('should aggregate requirements and inspections correctly', async () => {
      (prisma.work_orders.findFirst as any).mockResolvedValue({
        customerName: 'Customer A',
        division: 'Div1',
        projectName: 'Project X',
        quantity: 100,
        status: 'OPEN',
        workOrderNumber: 'WO-001',
      });
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      const { InspectionService } = await import('~/modules/inspection');
      (
        WorkOrderRequirementService.findActiveForAggregate as any
      ).mockResolvedValue([
        {
          id: 'req-1',
          partName: 'Frame',
          processName: 'Welding',
          requirementItems: '[{"a":1},{"a":2}]',
          requirementName: 'Weld Quality',
          confirmStatus: 'PENDING',
          attachment: '[]',
          confirmer: null,
          confirmedAt: null,
          createdAt: new Date('2024-01-01'),
          responsiblePerson: 'John',
          responsibleTeam: 'Team A',
        },
      ]);
      (
        InspectionService.getWorkOrderAggregateInspections as any
      ).mockResolvedValue([
        {
          id: 'insp-1',
          level1Component: 'Frame',
          level2Component: null,
          processName: 'Welding',
          items: [{}, {}],
          inspector: 'Inspector1',
          inspectionDate: new Date('2024-06-01'),
          quantity: 10,
          result: 'PASS',
          category: 'PROCESS',
          team: 'Team A',
          workOrderNumber: 'WO-001',
          incomingType: '',
          materialName: '',
        },
      ]);

      const result =
        await WorkOrderAggregateService.getWorkOrderAggregate('WO-001');

      expect(result.workOrder.customerName).toBe('Customer A');
      expect(result.summary.plannedPoints).toBe(2);
      expect(result.summary.inspectedPoints).toBe(2);
      expect(result.summary.completionRate).toBe(100);
      expect(result.requirements).toHaveLength(1);
      expect(result.requirements[0].executed).toBe(true);
    });

    it('should handle missing requirement points', async () => {
      (prisma.work_orders.findFirst as any).mockResolvedValue(null);
      const { WorkOrderRequirementService } = await import(
        '~/modules/work-order-requirement/work-order-requirement.service'
      );
      const { InspectionService } = await import('~/modules/inspection');
      (
        WorkOrderRequirementService.findActiveForAggregate as any
      ).mockResolvedValue([
        {
          id: 'req-1',
          partName: 'Frame',
          processName: 'Welding',
          requirementItems: 'not-json',
          requirementName: 'Quality',
          confirmStatus: 'PENDING',
          attachment: null,
          confirmer: null,
          confirmedAt: null,
          createdAt: new Date('2024-01-01'),
          responsiblePerson: '',
          responsibleTeam: '',
        },
      ]);
      (
        InspectionService.getWorkOrderAggregateInspections as any
      ).mockResolvedValue([]);

      const result =
        await WorkOrderAggregateService.getWorkOrderAggregate('WO-001');

      expect(result.summary.plannedPoints).toBe(1);
      expect(result.summary.inspectedPoints).toBe(0);
      expect(result.summary.completionRate).toBe(0);
    });

    it('should compute overdue unconfirmed requirements', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2025-01-15T00:00:00.000Z'));
        (prisma.work_orders.findFirst as any).mockResolvedValue(null);
        const { WorkOrderRequirementService } = await import(
          '~/modules/work-order-requirement/work-order-requirement.service'
        );
        const { InspectionService } = await import('~/modules/inspection');
        (
          WorkOrderRequirementService.findActiveForAggregate as any
        ).mockResolvedValue([
          {
            id: 'req-1',
            partName: 'A',
            processName: 'B',
            requirementItems: '[]',
            requirementName: 'R',
            confirmStatus: 'PENDING',
            attachment: null,
            confirmer: null,
            confirmedAt: null,
            createdAt: new Date('2024-12-01'),
            responsiblePerson: '',
            responsibleTeam: '',
          },
        ]);
        (
          InspectionService.getWorkOrderAggregateInspections as any
        ).mockResolvedValue([]);

        const result =
          await WorkOrderAggregateService.getWorkOrderAggregate('WO-001');

        expect(result.summary.overdueUnconfirmedRequirements).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
