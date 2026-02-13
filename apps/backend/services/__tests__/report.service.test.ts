import { beforeEach, describe, expect, it, vi } from 'vitest';

import prisma from '../../utils/prisma';
import { DeptService } from '../dept.service';
import { ReportService } from '../report.service';

vi.mock('../../utils/prisma', () => ({
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

vi.mock('../dept.service', () => ({
  DeptService: {
    findAll: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps tracking statuses and applies author from user context', async () => {
    (DeptService.findAll as any).mockResolvedValue([
      { id: 'd1', name: '质量部', children: [] },
      { id: 'd2', name: '生产部', children: [] },
    ]);

    (prisma.quality_losses.findMany as any).mockResolvedValue([
      {
        id: 'loss-1',
        description: 'a',
        status: 'Pending',
        updatedAt: new Date('2026-01-02'),
        respDept: 'd1',
      },
      {
        id: 'loss-2',
        description: 'b',
        status: 'Processing',
        updatedAt: new Date('2026-01-03'),
        respDept: 'd2',
      },
      {
        id: 'loss-3',
        description: 'c',
        status: 'Confirmed',
        updatedAt: new Date('2026-01-04'),
        respDept: 'd1',
      },
      {
        id: 'loss-4',
        description: 'd',
        status: 'Resolved',
        updatedAt: new Date('2026-01-05'),
        respDept: null,
      },
    ]);

    (prisma.quality_records.findMany as any).mockResolvedValue([
      {
        description: 'internal',
        projectName: 'P1',
        responsibleDepartment: 'd1',
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
        respDept: 'd2',
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
      '进行中',
      '已关闭',
      '已关闭',
    ]);
    expect(result.trackingIssues.map((i) => i.respDept)).toEqual([
      '质量部',
      '生产部',
      '质量部',
      '-',
    ]);
  });

  it('falls back to raw department id when department lookup fails', async () => {
    (DeptService.findAll as any).mockRejectedValue(new Error('db down'));
    (prisma.quality_losses.findMany as any).mockResolvedValue([
      {
        id: 'loss-1',
        description: 'x',
        status: 'Pending',
        updatedAt: new Date('2026-01-02'),
        respDept: 'raw-dept',
      },
    ]);
    (prisma.quality_records.findMany as any).mockResolvedValue([]);
    (prisma.after_sales.findMany as any).mockResolvedValue([]);

    const result = await ReportService.getWeeklyReport(
      '2026-01-01',
      '2026-01-07',
    );
    expect(result.trackingIssues[0]?.respDept).toBe('raw-dept');
  });

  it('throws when date arguments are invalid', async () => {
    await expect(
      ReportService.getWeeklyReport('invalid-date', '2026-01-07'),
    ).rejects.toThrow('Invalid startDate or endDate');
  });
});
