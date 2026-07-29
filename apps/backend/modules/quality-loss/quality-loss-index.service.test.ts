import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualityLossIndexService } from '~/modules/quality-loss/quality-loss-index.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    quality_loss_index: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe('qualityLossIndexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upsertFromAfterSales', () => {
    it('upserts when isClaim is true even with zero cost', async () => {
      await QualityLossIndexService.upsertFromAfterSales({
        actualClaim: 0,
        claimStatus: 'OPEN',
        createdBy: 'u-1',
        id: 'as-1',
        isClaim: true,
        isDeleted: false,
        laborTravelCost: 0,
        materialCost: 0,
        occurDate: new Date('2026-06-18T00:00:00.000Z'),
        partId: 'part-1',
        projectName: 'P',
        projectId: 'project-1',
        respDept: 'QA',
        respDeptId: 'dept-qa',
        workOrderNumber: 'WO-1',
      });

      expect(prisma.quality_loss_index.upsert).toHaveBeenCalledTimes(1);
      const call = (prisma.quality_loss_index.upsert as any).mock.calls[0][0];
      expect(call.create).toMatchObject({
        amount: 0,
        actualClaim: 0,
        createdBy: 'u-1',
        id: 'EXT-as-1',
        partId: 'part-1',
        projectId: 'project-1',
        respDeptId: 'dept-qa',
        source: 'External',
        sourcePk: 'as-1',
        status: 'OPEN',
      });
    });

    it('upserts when costs are non-zero even if isClaim is false', async () => {
      await QualityLossIndexService.upsertFromAfterSales({
        claimStatus: 'OPEN',
        createdBy: 'u-1',
        id: 'as-2',
        isClaim: false,
        isDeleted: false,
        laborTravelCost: 50,
        materialCost: 100,
        occurDate: new Date('2026-06-18T00:00:00.000Z'),
        projectName: 'P',
        respDept: 'QA',
        workOrderNumber: 'WO-2',
      });

      const call = (prisma.quality_loss_index.upsert as any).mock.calls[0][0];
      expect(call.create.amount).toBe(150);
    });

    it('soft-deletes when neither isClaim nor cost qualifies', async () => {
      await QualityLossIndexService.upsertFromAfterSales({
        claimStatus: 'OPEN',
        createdBy: 'u-1',
        id: 'as-3',
        isClaim: false,
        isDeleted: false,
        laborTravelCost: 0,
        materialCost: 0,
        occurDate: new Date('2026-06-18T00:00:00.000Z'),
        projectName: 'P',
        respDept: 'QA',
        workOrderNumber: 'WO-3',
      });

      expect(prisma.quality_loss_index.upsert).not.toHaveBeenCalled();
      expect(prisma.quality_loss_index.updateMany).toHaveBeenCalledWith({
        where: { source: 'External', sourcePk: 'as-3' },
        data: expect.objectContaining({ isDeleted: true }),
      });
    });

    it('soft-deletes when source row is deleted', async () => {
      await QualityLossIndexService.upsertFromAfterSales({
        claimStatus: 'OPEN',
        createdBy: 'u-1',
        id: 'as-4',
        isClaim: true,
        isDeleted: true,
        laborTravelCost: 100,
        materialCost: 100,
        occurDate: new Date('2026-06-18T00:00:00.000Z'),
        projectName: 'P',
        respDept: 'QA',
        workOrderNumber: 'WO-4',
      });

      expect(prisma.quality_loss_index.upsert).not.toHaveBeenCalled();
      expect(prisma.quality_loss_index.updateMany).toHaveBeenCalled();
    });
  });

  describe('upsertFromInternal', () => {
    it('upserts on positive lossAmount', async () => {
      await QualityLossIndexService.upsertFromInternal({
        createdBy: 'u-2',
        date: new Date('2026-06-18T00:00:00.000Z'),
        id: 'qr-1',
        isDeleted: false,
        lossAmount: 200,
        projectName: 'P',
        recoveredAmount: 50,
        responsibleDepartment: 'QA',
        responsibleDepartmentId: 'dept-qa',
        status: 'OPEN',
        workOrderNumber: 'WO-1',
      });
      const call = (prisma.quality_loss_index.upsert as any).mock.calls[0][0];
      expect(call.create.id).toBe('INT-qr-1');
      expect(call.create.amount).toBe(200);
      expect(call.create.actualClaim).toBe(50);
      expect(call.create.respDeptId).toBe('dept-qa');
    });

    it('soft-deletes when lossAmount is zero', async () => {
      await QualityLossIndexService.upsertFromInternal({
        createdBy: 'u-2',
        date: new Date(),
        id: 'qr-2',
        isDeleted: false,
        lossAmount: 0,
        projectName: 'P',
        recoveredAmount: 0,
        responsibleDepartment: 'QA',
        status: 'OPEN',
        workOrderNumber: 'WO-1',
      });
      expect(prisma.quality_loss_index.updateMany).toHaveBeenCalled();
    });
  });

  describe('upsertFromCommissioning', () => {
    it('matches the isClaim || lossAmount>0 rule used by the source filter', async () => {
      await QualityLossIndexService.upsertFromCommissioning({
        claimStatus: 'OPEN',
        createdBy: 'u-3',
        date: new Date(),
        id: 'da-1',
        isClaim: true,
        isDeleted: false,
        lossAmount: 0,
        projectName: 'P',
        recoveredAmount: 0,
        responsibleDepartment: 'Service',
        workOrderNumber: 'WO-1',
      });
      expect(prisma.quality_loss_index.upsert).toHaveBeenCalled();
    });
  });

  describe('upsertFromManual', () => {
    it('upserts on positive amount', async () => {
      await QualityLossIndexService.upsertFromManual({
        actualClaim: 30,
        amount: 100,
        createdBy: 'u-4',
        id: 'ql-1',
        isDeleted: false,
        occurDate: new Date('2026-06-18T00:00:00.000Z'),
        partName: '主梁',
        projectName: '1000t 架桥机',
        projectId: 'project-1',
        respDept: 'QA',
        respDeptId: 'dept-qa',
        status: 'Pending',
        type: 'Scrap',
        workOrderNumber: 'WO-468624',
      });
      const call = (prisma.quality_loss_index.upsert as any).mock.calls[0][0];
      expect(call.create.id).toBe('QL-ql-1');
      expect(call.create.amount).toBe(100);
      expect(call.create).toEqual(
        expect.objectContaining({
          partName: '主梁',
          projectName: '1000t 架桥机',
          projectId: 'project-1',
          respDeptId: 'dept-qa',
          lossType: 'Scrap',
          workOrderNumber: 'WO-468624',
        }),
      );
    });

    it('soft-deletes when amount is zero', async () => {
      await QualityLossIndexService.upsertFromManual({
        actualClaim: 0,
        amount: 0,
        createdBy: 'u-4',
        id: 'ql-2',
        isDeleted: false,
        occurDate: new Date(),
        partName: null,
        projectName: null,
        respDept: 'QA',
        status: 'Pending',
        type: 'Scrap',
        workOrderNumber: null,
      });
      expect(prisma.quality_loss_index.updateMany).toHaveBeenCalled();
    });
  });

  describe('softDeleteSourceMany', () => {
    it('issues a single updateMany for batch removals', async () => {
      await QualityLossIndexService.softDeleteSourceMany('External', [
        'as-1',
        'as-2',
      ]);
      expect(prisma.quality_loss_index.updateMany).toHaveBeenCalledWith({
        where: { source: 'External', sourcePk: { in: ['as-1', 'as-2'] } },
        data: expect.objectContaining({ isDeleted: true }),
      });
    });

    it('skips when ids array is empty', async () => {
      await QualityLossIndexService.softDeleteSourceMany('External', []);
      expect(prisma.quality_loss_index.updateMany).not.toHaveBeenCalled();
    });
  });
});
