import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetrologyImportService } from '~/modules/metrology/metrology-import.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    measuring_instruments: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn(
    (_table: string, fields: Record<string, unknown>) => ({
      instrumentName: fields.instrumentName,
    }),
  ),
  buildGovernedCanonicalWritePairForTable: vi.fn(async () => ({
    canonicalNameId: 'canon-name-1',
  })),
}));

describe('metrologyImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports valid rows, skips header/blank rows, normalizes dates, and upserts by instrument code', async () => {
    vi.mocked(prisma.measuring_instruments.upsert).mockResolvedValue(
      {} as never,
    );

    const result = await MetrologyImportService.importItems(
      [
        { 序号: '序号', 量具名称: '量具名称', 编号: '编号' },
        {},
        {
          序号: '1',
          量具名称: ' Gauge ',
          编号: ' M-001 ',
          型号: ' G-1 ',
          使用单位: ' QA ',
          有效期: '2026-12-31',
        },
        {
          orderNo: '2',
          instrumentName: 'Caliper',
          instrumentCode: 'M-002',
          model: 'C-1',
          usingUnit: 'QC',
          validUntil: 46_023,
        },
      ],
      'admin',
      'metrology.xlsx',
    );

    expect(result).toEqual({
      errorCount: 0,
      errors: [],
      failedCount: 0,
      successCount: 2,
      totalCount: 4,
    });
    expect(prisma.measuring_instruments.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.measuring_instruments.upsert).toHaveBeenNthCalledWith(1, {
      where: { instrumentCode: 'M-001' },
      update: expect.objectContaining({
        instrumentName: 'Gauge',
        isDeleted: false,
        model: 'G-1',
        orderNo: 1,
        sourceFileName: 'metrology.xlsx',
        updatedBy: 'admin',
        usingUnit: 'QA',
        validUntil: expect.any(Date),
      }),
      create: expect.objectContaining({
        createdBy: 'admin',
        instrumentCode: 'M-001',
        instrumentName: 'Gauge',
        sourceFileName: 'metrology.xlsx',
        updatedBy: 'admin',
      }),
    });
  });

  it('collects row-level validation errors for missing fields, duplicates, and invalid dates', async () => {
    const result = await MetrologyImportService.importItems([
      { 编号: 'M-001', 有效期: '2026-12-31' },
      { 量具名称: 'Gauge' },
      { 量具名称: 'Gauge', 编号: 'M-002', 有效期: 'not-a-date' },
      { 量具名称: 'Gauge', 编号: 'M-003', 有效期: '1999-01-01' },
      { 量具名称: 'Gauge', 编号: 'M-004', 有效期: 0 },
      { 量具名称: 'Gauge', 编号: 'M-005', 有效期: '2026-12-31' },
      { 量具名称: 'Gauge 2', 编号: 'M-005', 有效期: '2026-12-31' },
    ]);

    expect(result.successCount).toBe(2);
    expect(result.failedCount).toBe(5);
    expect(result.errors).toEqual([
      { row: 3, reason: '编号不能为空' },
      { row: 4, reason: '有效期格式无效' },
      { row: 5, reason: '有效期超出合理范围' },
      { row: 6, reason: '有效期格式无效' },
      { row: 8, reason: '同一文件中编号重复' },
    ]);
  });

  it('accepts array-position based rows when localized headers are absent', async () => {
    vi.mocked(prisma.measuring_instruments.upsert).mockResolvedValue(
      {} as never,
    );

    await MetrologyImportService.importItems([
      {
        col0: '9',
        col1: 'Micrometer',
        col2: 'M-009',
        col3: 'MIC',
        col4: 'QA',
        col5: '2026/12/31',
      },
    ]);

    expect(prisma.measuring_instruments.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { instrumentCode: 'M-009' },
        create: expect.objectContaining({
          instrumentName: 'Micrometer',
          model: 'MIC',
          orderNo: 9,
          usingUnit: 'QA',
        }),
      }),
    );
  });
});
