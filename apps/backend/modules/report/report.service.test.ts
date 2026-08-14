import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import { ReportService } from '~/modules/report/report.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    after_sales: {
      findMany: vi.fn(),
    },
    quality_losses: {
      findMany: vi.fn(),
    },
    quality_records: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('~/modules/dept', () => ({
  DeptService: {
    resolveActiveNamesByIds: vi.fn().mockResolvedValue(new Map()),
  },
}));

vi.mock('~/modules/quality-classification', () => ({
  QualityClassificationService: {
    resolveCategoryNamesByIds: vi.fn(),
    resolveSubcategoryNamesByIds: vi.fn(),
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('reportService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { QualityClassificationService } = await import(
      '~/modules/quality-classification'
    );
    vi.mocked(
      QualityClassificationService.resolveCategoryNamesByIds,
    ).mockResolvedValue(new Map());
    vi.mocked(
      QualityClassificationService.resolveSubcategoryNamesByIds,
    ).mockResolvedValue(new Map());
  });

  it('maps tracking statuses and applies author from user context', async () => {
    vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(
      new Map([
        ['d1', '质量部'],
        ['d2', '生产部'],
      ]),
    );

    (prisma.quality_losses.findMany as any).mockResolvedValue([
      {
        id: 'loss-1',
        description: 'a',
        status: 'Pending',
        updatedAt: new Date('2026-01-02'),
        respDept: 'Legacy Quality',
        respDeptId: 'd1',
      },
      {
        id: 'loss-2',
        description: 'b',
        status: 'Processing',
        updatedAt: new Date('2026-01-03'),
        respDept: 'Legacy Production',
        respDeptId: 'd2',
      },
      {
        id: 'loss-3',
        description: 'c',
        status: 'Confirmed',
        updatedAt: new Date('2026-01-04'),
        respDept: 'Legacy Quality',
        respDeptId: 'd1',
      },
      {
        id: 'loss-4',
        description: 'd',
        status: 'Resolved',
        updatedAt: new Date('2026-01-05'),
        respDept: null,
        respDeptId: null,
      },
    ]);

    (prisma.quality_records.findMany as any).mockResolvedValue([
      {
        description: 'internal',
        projectName: 'P1',
        responsibleDepartment: 'Legacy Quality',
        responsibleDepartmentId: 'd1',
        severity: 'high',
        rootCause: 'R',
        analysis: null,
        solution: 'S',
        status: 'CLOSED',
        updatedAt: new Date('2026-01-03'),
      },
    ]);

    (prisma.after_sales.findMany as any).mockResolvedValue([
      {
        issueDescription: 'external',
        projectName: 'P2',
        productType: null,
        respDept: 'Legacy Production',
        respDeptId: 'd2',
        severity: 'low',
        failureCause: null,
        defectType: 'D1',
        defectSubtype: 'D2',
        solution: null,
        actualSolution: 'AS',
        claimStatus: 'COMPLETED',
        updatedAt: new Date('2026-01-06'),
      },
    ]);

    const result = await ReportService.getWeeklyReport(
      '2026-01-01',
      '2026-01-07',
      {
        name: '张三',
        dept: '质管部',
        role: 'manager',
        leader: '李四',
      },
    );

    expect(result.author).toEqual({
      dept: '质管部',
      leader: '李四',
      name: '张三',
      role: 'manager',
    });
    expect(result.trackingIssues.map((i) => i.progress)).toEqual([
      '待处理',
      '待处理',
      '待处理',
      '已关闭',
    ]);
    expect(result.trackingIssues.map((i) => i.respDept)).toEqual([
      '质量部',
      '生产部',
      '质量部',
      '未分配',
    ]);
  });

  it('keeps legacy department evidence when canonical resolution fails', async () => {
    vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(new Map());
    (prisma.quality_losses.findMany as any).mockResolvedValue([
      {
        id: 'loss-1',
        description: 'x',
        status: 'Pending',
        updatedAt: new Date('2026-01-02'),
        respDept: 'Legacy Department',
        respDeptId: 'raw-dept',
      },
    ]);
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
    (prisma.after_sales.findMany as any).mockResolvedValue([]);

    const result = await ReportService.getWeeklyReport(
      '2026-01-01',
      '2026-01-07',
    );
    expect(result.trackingIssues[0]?.respDept).toBe(
      '主数据已失效：Legacy Department',
    );
  });

  it('uses canonical after-sales classification names after rename', async () => {
    const { QualityClassificationService } = await import(
      '~/modules/quality-classification'
    );
    vi.mocked(
      QualityClassificationService.resolveCategoryNamesByIds,
    ).mockImplementation(async (scope) => {
      if (scope === 'AFTER_SALES_PRODUCT') {
        return new Map([['product-category-1', 'Renamed Product']]);
      }
      return new Map([['defect-category-1', 'Renamed Defect']]);
    });
    vi.mocked(
      QualityClassificationService.resolveSubcategoryNamesByIds,
    ).mockResolvedValue(
      new Map([['defect-subcategory-1', 'Renamed Subcategory']]),
    );
    vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(new Map());
    (prisma.quality_losses.findMany as any).mockResolvedValue([]);
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
    (prisma.after_sales.findMany as any).mockResolvedValue([
      {
        actualSolution: null,
        claimStatus: 'OPEN',
        defectCategoryId: 'defect-category-1',
        defectSubcategoryId: 'defect-subcategory-1',
        defectSubtype: 'Legacy Subcategory',
        defectType: 'Legacy Defect',
        failureCause: null,
        issueDescription: 'external',
        productCategoryId: 'product-category-1',
        productType: 'Legacy Product',
        projectName: '',
        respDept: 'Legacy Department',
        respDeptId: null,
        severity: 'low',
        solution: null,
        updatedAt: new Date('2026-01-06'),
      },
    ]);

    const result = await ReportService.getWeeklyReport(
      '2026-01-01',
      '2026-01-07',
    );

    expect(result.externalIssues[0]).toMatchObject({
      cause: 'Renamed Defect - Renamed Subcategory',
      product: 'Renamed Product',
      respDept: '数据待治理：Legacy Department',
    });
  });

  it('keeps legacy after-sales classification snapshots without IDs', async () => {
    vi.mocked(DeptService.resolveActiveNamesByIds).mockResolvedValue(new Map());
    (prisma.quality_losses.findMany as any).mockResolvedValue([]);
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
    (prisma.after_sales.findMany as any).mockResolvedValue([
      {
        actualSolution: null,
        claimStatus: 'OPEN',
        defectCategoryId: null,
        defectSubcategoryId: null,
        defectSubtype: 'Legacy Subcategory',
        defectType: 'Legacy Defect',
        failureCause: null,
        issueDescription: 'external',
        productCategoryId: null,
        productType: 'Legacy Product',
        projectName: '',
        respDept: 'Legacy Department',
        respDeptId: null,
        severity: 'low',
        solution: null,
        updatedAt: new Date('2026-01-06'),
      },
    ]);

    const result = await ReportService.getWeeklyReport(
      '2026-01-01',
      '2026-01-07',
    );

    expect(result.externalIssues[0]).toMatchObject({
      cause: '数据待治理：Legacy Defect - 数据待治理：Legacy Subcategory',
      product: '数据待治理：Legacy Product',
      respDept: '数据待治理：Legacy Department',
    });
  });

  it('throws when date arguments are invalid', async () => {
    await expect(
      ReportService.getWeeklyReport('invalid-date', '2026-01-07'),
    ).rejects.toThrow('Invalid startDate or endDate');
  });
});
