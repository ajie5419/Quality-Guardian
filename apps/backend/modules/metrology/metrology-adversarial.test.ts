import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { MetrologyService } from './metrology.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    measuring_instruments: {
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: vi.fn(
    (_table: string, input: Record<string, unknown>) => input,
  ),
  buildGovernedCanonicalWritePairForTable: vi.fn().mockResolvedValue({}),
}));

vi.mock('~/utils/query-helpers', () => ({
  buildKeywordOr: vi.fn(() => null),
  parsePagination: vi.fn(
    (params: { page?: number; pageSize?: number } = {}) => {
      const rawPage = Number(params.page);
      const rawPageSize = Number(params.pageSize);
      const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
      const pageSize = Number.isFinite(rawPageSize)
        ? Math.min(100, Math.max(1, rawPageSize))
        : 20;
      return {
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize,
      };
    },
  ),
}));

vi.mock('~/utils/redis', () => ({
  redis: { delByPattern: vi.fn(), get: vi.fn(), set: vi.fn() },
}));

vi.mock('~/utils/module-loader', () => ({
  ensureModuleMenus: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  useResponseSuccess: vi.fn((data: unknown) => ({ code: 0, data })),
}));

vi.mock('~/modules/metrology/metrology-import.service', () => ({
  MetrologyImportService: {
    importItems: vi.fn().mockResolvedValue({
      errorCount: 0,
      errors: [],
      failedCount: 0,
      successCount: 0,
      totalCount: 0,
    }),
  },
}));

vi.mock('~/modules/metrology/metrology-template', () => ({
  getMetrologyTemplateRows: vi.fn(() => [
    {
      序号: 1,
      量具名称: '游标卡尺',
      编号: 'JL-001',
      型号: '0-150mm',
      使用单位: '结构BU1',
      有效期: '2026-12-31',
      检验状态: '在检',
    },
  ]),
}));

vi.mock('~/modules/metrology/metrology-status', () => {
  const INSPECTION_LABELS: Record<string, string> = {
    DISABLED: '停用',
    EXPIRED: '超期',
    PENDING: '待检',
    VALID: '在检',
  };
  const BORROW_LABELS: Record<string, string> = {
    AVAILABLE: '未借出',
    BORROWED: '已借出',
    RETURN_PENDING: '待确认归还',
  };

  function startOfToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  function calculateRemainingDays(validUntil: Date | null) {
    if (!validUntil) return null;
    const diff = validUntil.getTime() - startOfToday().getTime();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  function deriveMetrologyInspectionStatus(
    rawStatus: null | string | undefined,
    validUntil: Date | null,
  ) {
    const remainingDays = calculateRemainingDays(validUntil);
    const statusText = String(rawStatus || '')
      .trim()
      .toUpperCase();
    if (
      statusText === 'DISABLED' ||
      rawStatus === '停用' ||
      rawStatus === '禁用'
    ) {
      return 'DISABLED';
    }
    if (remainingDays === null) return 'PENDING';
    if (remainingDays < 0) return 'EXPIRED';
    if (remainingDays <= 30) return 'PENDING';
    return 'VALID';
  }

  function formatMetrologyDate(value: Date | null | string | undefined) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function normalizeMetrologyBorrowStatus(
    rawStatus: null | string | undefined,
  ) {
    const status = String(rawStatus || '')
      .trim()
      .toUpperCase();
    if (status === 'BORROWED' || status === 'RETURN_PENDING') return status;
    return 'AVAILABLE';
  }

  return {
    calculateRemainingDays,
    deriveMetrologyInspectionStatus,
    formatMetrologyDate,
    getMetrologyBorrowStatusLabel: (s: string) => BORROW_LABELS[s] ?? s,
    getMetrologyInspectionStatusLabel: (s: string) => INSPECTION_LABELS[s] ?? s,
    normalizeMetrologyBorrowStatus,
    startOfToday,
  };
});

// ── helpers ──

function makeInstrument(overrides: Record<string, unknown> = {}) {
  return {
    borrowStatus: 'AVAILABLE',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    id: 'mi-1',
    inspectionStatus: 'VALID',
    instrumentCode: 'CODE-001',
    instrumentName: '游标卡尺',
    model: '0-150mm',
    orderNo: 1,
    sourceFileName: null,
    updatedAt: new Date('2025-06-01T00:00:00Z'),
    usingUnit: '结构BU1',
    validUntil: new Date('2026-12-31'),
    ...overrides,
  };
}

const mockPrisma = vi.mocked(prisma) as any;

// ═══════════════════════════════════════════════
// Metrology Service — Adversarial Tests
// ═══════════════════════════════════════════════

describe('metrologyService — buildMutationPayload', () => {
  it('throws when instrumentName is empty', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'X',
        instrumentName: '',
      }),
    ).toThrow('量具名称不能为空');
  });

  it('throws when instrumentCode is empty', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: '',
        instrumentName: 'A',
      }),
    ).toThrow('编号不能为空');
  });

  it('throws when validUntil has invalid format', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'X',
        instrumentName: 'A',
        validUntil: 'not-a-date',
      }),
    ).toThrow('有效期格式无效');
  });

  it('throws when validUntil year is out of range (year < 2000)', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'X',
        instrumentName: 'A',
        validUntil: '1999-01-01',
      }),
    ).toThrow('有效期超出合理范围');
  });

  it('accepts valid ISO date string', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C-1',
      instrumentName: 'N1',
      validUntil: '2030-06-15',
    });
    expect(result.instrumentCode).toBe('C-1');
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('accepts Date object as validUntil', () => {
    const d = new Date(2030, 0, 1);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C-2',
      instrumentName: 'N2',
      validUntil: d,
    });
    expect(result.validUntil).toBe(d);
  });

  it('accepts null validUntil (no error)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C-3',
      instrumentName: 'N3',
      validUntil: null,
    });
    expect(result.validUntil).toBeNull();
  });

  it('accepts Excel serial date number', () => {
    // 45658 = 2025-01-01 in Excel serial
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C-4',
      instrumentName: 'N4',
      validUntil: 45_658,
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('throws for negative Excel serial', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: -1,
      }),
    ).toThrow('有效期格式无效');
  });

  it('derives PENDING status when validUntil is within 30 days', () => {
    const future = new Date();
    future.setDate(future.getDate() + 15);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: future,
    });
    expect(result.inspectionStatus).toBe('PENDING');
  });

  it('derives EXPIRED status when validUntil is in the past', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: past,
    });
    expect(result.inspectionStatus).toBe('EXPIRED');
  });

  it('derives VALID status when validUntil > 30 days away', () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: future,
    });
    expect(result.inspectionStatus).toBe('VALID');
  });

  it('respects explicit DISABLED inspectionStatus even with valid date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const result = MetrologyService.buildMutationPayload({
      inspectionStatus: 'DISABLED',
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: future,
    });
    expect(result.inspectionStatus).toBe('DISABLED');
  });

  it('respects Chinese 停用 inspectionStatus', () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const result = MetrologyService.buildMutationPayload({
      inspectionStatus: '停用',
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: future,
    });
    expect(result.inspectionStatus).toBe('DISABLED');
  });

  it('parses orderNo from numeric value', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: 42,
    });
    expect(result.orderNo).toBe(42);
  });

  it('parses orderNo from string', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: '7',
    });
    expect(result.orderNo).toBe(7);
  });

  it('returns null orderNo for non-numeric string', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: 'abc',
    });
    expect(result.orderNo).toBeNull();
  });

  it('trims whitespace from instrumentName and instrumentCode', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: '  C  ',
      instrumentName: '  N  ',
    });
    expect(result.instrumentCode).toBe('C');
    expect(result.instrumentName).toBe('N');
  });

  it('treats whitespace-only name as empty → throws', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: '   ',
      }),
    ).toThrow('量具名称不能为空');
  });

  it('treats whitespace-only code as empty → throws', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: '   ',
        instrumentName: 'N',
      }),
    ).toThrow('编号不能为空');
  });

  it('accepts Chinese date format 2026年12月31日', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2026年12月31日',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('accepts dot-separated date 2026.12.31', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2026.12.31',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('accepts slash-separated date 2026/12/31', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2026/12/31',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('rejects invalid date like 2026-02-30', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2026-02-30',
      }),
    ).toThrow();
  });
});

// ── getList pagination ──

describe('metrologyService — getList pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('clamps page to minimum 1 when page=0', async () => {
    await MetrologyService.getList({ page: 0, pageSize: 10 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
  });

  it('clamps page to minimum 1 when page is negative', async () => {
    await MetrologyService.getList({ page: -5, pageSize: 10 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
  });

  it('clamps pageSize to max 100 when pageSize=500', async () => {
    await MetrologyService.getList({ page: 1, pageSize: 500 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(100);
  });

  it('clamps pageSize to minimum 1 when pageSize=0', async () => {
    await MetrologyService.getList({ page: 1, pageSize: 0 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(1);
  });

  it('defaults page=1, pageSize=20 when omitted', async () => {
    await MetrologyService.getList({});
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
  });

  it('calculates correct skip for page=3, pageSize=10', async () => {
    await MetrologyService.getList({ page: 3, pageSize: 10 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
  });
});

// ── getList status filter where clause ──

describe('metrologyService — getList inspection status filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('builds DISABLED where when inspectionStatus=DISABLED', async () => {
    await MetrologyService.getList({ inspectionStatus: 'DISABLED' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.AND).toBeDefined();
  });

  it('builds EXPIRED where when inspectionStatus=EXPIRED', async () => {
    await MetrologyService.getList({ inspectionStatus: 'EXPIRED' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.AND).toBeDefined();
  });

  it('builds PENDING where when inspectionStatus=PENDING', async () => {
    await MetrologyService.getList({ inspectionStatus: 'PENDING' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.AND).toBeDefined();
  });

  it('builds VALID where when inspectionStatus=VALID', async () => {
    await MetrologyService.getList({ inspectionStatus: 'VALID' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.AND).toBeDefined();
  });

  it('does not add AND filter when inspectionStatus is undefined', async () => {
    await MetrologyService.getList({});
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.AND).toBeUndefined();
  });
});

// ── getOverview ──

describe('metrologyService — getOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
  });

  it('returns zeroed overview for empty data', async () => {
    const result = await MetrologyService.getOverview({});
    expect(result).toEqual({
      disabledCount: 0,
      expiredCount: 0,
      expiringSoonCount: 0,
      totalCount: 0,
      validCount: 0,
    });
  });

  it('counts DISABLED items correctly', async () => {
    const now = new Date();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({
        inspectionStatus: 'DISABLED',
        validUntil: new Date(now.getFullYear() + 10, 0, 1),
      }),
      makeInstrument({
        id: 'mi-2',
        inspectionStatus: 'DISABLED',
        validUntil: new Date(now.getFullYear() + 10, 0, 1),
      }),
    ]);
    const result = await MetrologyService.getOverview({});
    expect(result.disabledCount).toBe(2);
    expect(result.totalCount).toBe(2);
  });

  it('counts EXPIRED items correctly', async () => {
    const past = new Date();
    past.setFullYear(past.getFullYear() - 1);
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ validUntil: past }),
    ]);
    const result = await MetrologyService.getOverview({});
    expect(result.expiredCount).toBe(1);
  });

  it('counts VALID items correctly', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ validUntil: future }),
    ]);
    const result = await MetrologyService.getOverview({});
    expect(result.validCount).toBe(1);
  });

  it('counts PENDING (expiring soon) items correctly', async () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 15);
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ validUntil: soon }),
    ]);
    const result = await MetrologyService.getOverview({});
    expect(result.expiringSoonCount).toBe(1);
  });

  it('ignores inspectionStatus filter for overview (ignoreInspectionStatus=true)', async () => {
    await MetrologyService.getOverview({ inspectionStatus: 'VALID' });
    // The overview uses ignoreInspectionStatus: true so the count query should not have AND filter
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.where.AND).toBeUndefined();
  });
});

// ── batchDelete ──

describe('metrologyService — batchDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.updateMany.mockResolvedValue({ count: 0 });
  });

  it('passes ids to updateMany with soft delete', async () => {
    await MetrologyService.batchDelete(['a', 'b', 'c'], 'admin');
    expect(mockPrisma.measuring_instruments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['a', 'b', 'c'] }, isDeleted: false },
        data: expect.objectContaining({ isDeleted: true, updatedBy: 'admin' }),
      }),
    );
  });

  it('sets updatedBy to null when username is undefined', async () => {
    await MetrologyService.batchDelete(['x']);
    const call = mockPrisma.measuring_instruments.updateMany.mock.calls[0][0];
    expect(call.data.updatedBy).toBeNull();
  });

  it('handles empty ids array', async () => {
    await MetrologyService.batchDelete([]);
    expect(mockPrisma.measuring_instruments.updateMany).toHaveBeenCalled();
  });
});

// ── deleteById ──

describe('metrologyService — deleteById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.update.mockResolvedValue({} as never);
  });

  it('soft-deletes by id with updatedBy', async () => {
    await MetrologyService.deleteById('mi-1', 'admin');
    expect(mockPrisma.measuring_instruments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mi-1' },
        data: expect.objectContaining({ isDeleted: true, updatedBy: 'admin' }),
      }),
    );
  });
});

// ── create ──

describe('metrologyService — create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.create.mockResolvedValue({} as never);
  });

  it('creates with createdBy and updatedBy', async () => {
    await MetrologyService.create(
      { instrumentCode: 'C', instrumentName: 'N' },
      'operator',
    );
    expect(mockPrisma.measuring_instruments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdBy: 'operator',
          updatedBy: 'operator',
        }),
      }),
    );
  });

  it('sets createdBy/updatedBy to null when username omitted', async () => {
    await MetrologyService.create({ instrumentCode: 'C', instrumentName: 'N' });
    const call = mockPrisma.measuring_instruments.create.mock.calls[0][0];
    expect(call.data.createdBy).toBeNull();
    expect(call.data.updatedBy).toBeNull();
  });
});

// ── updateById ──

describe('metrologyService — updateById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.update.mockResolvedValue({} as never);
  });

  it('updates by id with mutation payload', async () => {
    await MetrologyService.updateById(
      'mi-1',
      { instrumentCode: 'C', instrumentName: 'N' },
      'updater',
    );
    expect(mockPrisma.measuring_instruments.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mi-1' },
        data: expect.objectContaining({ updatedBy: 'updater' }),
      }),
    );
  });
});

// ── buildListItem edge cases (via getList with items) ──

describe('metrologyService — buildListItem via getList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null validUntil → remainingDays=null, status=PENDING', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ validUntil: null }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);

    const result = await MetrologyService.getList({});
    expect(result.items[0].remainingDays).toBeNull();
    expect(result.items[0].inspectionStatus).toBe('PENDING');
    expect(result.items[0].validUntil).toBeNull();
  });

  it('formats validUntil to ISO date string', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ validUntil: new Date('2026-06-15T00:00:00Z') }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);

    const result = await MetrologyService.getList({});
    expect(result.items[0].validUntil).toBe('2026-06-15');
  });

  it('normalizes BORROWED borrowStatus', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ borrowStatus: 'BORROWED' }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);

    const result = await MetrologyService.getList({});
    expect(result.items[0].borrowStatus).toBe('BORROWED');
    expect(result.items[0].borrowStatusLabel).toBe('已借出');
  });

  it('normalizes unknown borrowStatus to AVAILABLE', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ borrowStatus: 'UNKNOWN_XYZ' }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);

    const result = await MetrologyService.getList({});
    expect(result.items[0].borrowStatus).toBe('AVAILABLE');
  });

  it('returns ISO strings for createdAt and updatedAt', async () => {
    const created = new Date('2025-01-15T10:30:00Z');
    const updated = new Date('2025-06-20T14:00:00Z');
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ createdAt: created, updatedAt: updated }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);

    const result = await MetrologyService.getList({});
    expect(result.items[0].createdAt).toBe(created.toISOString());
    expect(result.items[0].updatedAt).toBe(updated.toISOString());
  });
});

// ── getExportList ──

describe('metrologyService — getExportList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ id: 'e1' }),
      makeInstrument({ id: 'e2' }),
    ]);
  });

  it('returns all items without pagination', async () => {
    const result = await MetrologyService.getExportList({});
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});

// ── getTemplateRows ──

describe('metrologyService — getTemplateRows', () => {
  it('returns template rows with expected fields', () => {
    const rows = MetrologyService.getTemplateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]['量具名称']).toBe('游标卡尺');
    expect(rows[0]['编号']).toBe('JL-001');
  });
});

// ── validFrom / validTo filter ──

describe('metrologyService — validFrom/validTo date range filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('applies validFrom gte filter', async () => {
    await MetrologyService.getList({ validFrom: '2025-01-01' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.validUntil).toBeDefined();
    expect(call.where.validUntil.gte).toBeDefined();
  });

  it('applies validTo lte filter', async () => {
    await MetrologyService.getList({ validTo: '2025-12-31' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.validUntil.lte).toBeDefined();
  });

  it('applies both validFrom and validTo', async () => {
    await MetrologyService.getList({
      validFrom: '2025-01-01',
      validTo: '2025-12-31',
    });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.validUntil.gte).toBeDefined();
    expect(call.where.validUntil.lte).toBeDefined();
  });
});

// ── sortBy / sortOrder ──

describe('metrologyService — sortBy and sortOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('uses default sort when sortBy is unknown', async () => {
    await MetrologyService.getList({ sortBy: 'nonexistent' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ orderNo: 'asc' }, { createdAt: 'desc' }]);
  });

  it('applies desc sortOrder for validUntil', async () => {
    await MetrologyService.getList({ sortBy: 'validUntil', sortOrder: 'desc' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ validUntil: 'desc' });
  });

  it('applies asc sortOrder for instrumentCode', async () => {
    await MetrologyService.getList({
      sortBy: 'instrumentCode',
      sortOrder: 'asc',
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ instrumentCode: 'asc' });
  });
});

// ── importItems delegation ──

describe('metrologyService — importItems', () => {
  it('delegates to MetrologyImportService.importItems', async () => {
    const { MetrologyImportService } = await import(
      '~/modules/metrology/metrology-import.service'
    );
    vi.mocked(MetrologyImportService.importItems).mockResolvedValue({
      errorCount: 1,
      errors: [{ row: 2, reason: 'test' }],
      failedCount: 1,
      successCount: 5,
      totalCount: 6,
    });
    const result = await MetrologyService.importItems(
      [{ name: 'test' }],
      'admin',
      'file.xlsx',
    );
    expect(result.successCount).toBe(5);
    expect(result.errorCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Date Parsing Boundaries
// ═══════════════════════════════════════════════

describe('metrologyService — buildMutationPayload date parsing adversarial', () => {
  it('accepts undefined validUntil (returns null date, no error)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: undefined,
    });
    expect(result.validUntil).toBeNull();
  });

  it('accepts empty string validUntil (returns null date)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '',
    });
    expect(result.validUntil).toBeNull();
  });

  it('accepts year 2000 boundary date', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2000-01-01',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
    expect(result.validUntil?.getFullYear()).toBe(2000);
  });

  it('rejects year 2101 as out of range', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2101-01-01',
      }),
    ).toThrow('有效期超出合理范围');
  });

  it('accepts year 2100 boundary (not rejected)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2100-12-31',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('rejects NaN Date object', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: new Date('invalid'),
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects Excel serial 0', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: 0,
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects Infinity as numeric serial', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: Infinity,
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects -Infinity as numeric serial', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: -Infinity,
      }),
    ).toThrow('有效期格式无效');
  });

  it('parses fractional Excel serial (45658.5)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: 45_658.5,
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('parses numeric string "45658" as Excel serial', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '45658',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('parses fractional numeric string "45658.5" as Excel serial', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '45658.5',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('rejects "0" as numeric string Excel serial', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '0',
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects non-date text like "abc123"', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: 'abc123',
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects month 13 in structured date', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2026-13-01',
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects day 32 in structured date', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2026-01-32',
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects Feb 29 in non-leap year', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2025-02-29',
      }),
    ).toThrow('有效期格式无效');
  });

  it('accepts Feb 29 in leap year', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2028-02-29',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('rejects month 0', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2026-00-01',
      }),
    ).toThrow('有效期格式无效');
  });

  it('rejects day 0', () => {
    expect(() =>
      MetrologyService.buildMutationPayload({
        instrumentCode: 'C',
        instrumentName: 'N',
        validUntil: '2026-01-00',
      }),
    ).toThrow('有效期格式无效');
  });

  it('accepts zero-padded date "2026-01-01"', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2026-01-01',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });

  it('accepts short date "2026-1-1" (no zero-padding)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: '2026-1-1',
    });
    expect(result.validUntil).toBeInstanceOf(Date);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Status Transition Boundaries
// ═══════════════════════════════════════════════

describe('metrologyService — status derivation boundary conditions', () => {
  it('pENDING at exactly 30 days remaining (time set to midnight)', () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    d.setHours(0, 0, 0, 0);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('PENDING');
  });

  it('vALID at exactly 31 days remaining (time set to midnight)', () => {
    const d = new Date();
    d.setDate(d.getDate() + 31);
    d.setHours(0, 0, 0, 0);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('VALID');
  });

  it('pENDING at 0 days remaining (today, midnight)', () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('PENDING');
  });

  it('eXPIRED when validUntil is before today start', () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('EXPIRED');
  });

  it('pENDING when validUntil is null (no date → pending)', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: null,
    });
    expect(result.inspectionStatus).toBe('PENDING');
  });

  it('dISABLED wins over date-based derivation', () => {
    const d = new Date();
    d.setDate(d.getDate() + 100);
    const result = MetrologyService.buildMutationPayload({
      inspectionStatus: 'DISABLED',
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('DISABLED');
  });

  it('respects Chinese 禁用 as DISABLED', () => {
    const d = new Date();
    d.setDate(d.getDate() + 100);
    const result = MetrologyService.buildMutationPayload({
      inspectionStatus: '禁用',
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('DISABLED');
  });

  it('respects lowercase "disabled" via toUpperCase()', () => {
    const d = new Date();
    d.setDate(d.getDate() + 100);
    const result = MetrologyService.buildMutationPayload({
      inspectionStatus: 'disabled',
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('DISABLED');
  });

  it('respects mixed case "Disabled" via toUpperCase()', () => {
    const d = new Date();
    d.setDate(d.getDate() + 100);
    const result = MetrologyService.buildMutationPayload({
      inspectionStatus: 'Disabled',
      instrumentCode: 'C',
      instrumentName: 'N',
      validUntil: d,
    });
    expect(result.inspectionStatus).toBe('DISABLED');
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Mutation Payload Normalization
// ═══════════════════════════════════════════════

describe('metrologyService — buildMutationPayload normalization adversarial', () => {
  it('handles undefined for all optional fields', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
    });
    expect(result.model).toBeNull();
    expect(result.usingUnit).toBeNull();
    expect(result.orderNo).toBeNull();
    expect(result.validUntil).toBeNull();
    expect(result.inspectionStatus).toBe('PENDING');
  });

  it('trims model and usingUnit, null if empty', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      model: '  ',
      usingUnit: '  ',
    });
    expect(result.model).toBeNull();
    expect(result.usingUnit).toBeNull();
  });

  it('preserves non-empty model/usingUnit after trim', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      model: '  M1  ',
      usingUnit: '  BU  ',
    });
    expect(result.model).toBe('M1');
    expect(result.usingUnit).toBe('BU');
  });

  it('parses orderNo from float string "3.14"', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: '3.14',
    });
    expect(result.orderNo).toBe(3.14);
  });

  it('returns null orderNo for empty string', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: '',
    });
    expect(result.orderNo).toBeNull();
  });

  it('returns null orderNo for null', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: null,
    });
    expect(result.orderNo).toBeNull();
  });

  it('returns null orderNo for boolean', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: true as unknown as number,
    });
    expect(result.orderNo).toBeNull();
  });

  it('returns null orderNo for Infinity', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: Infinity,
    });
    expect(result.orderNo).toBeNull();
  });

  it('returns null orderNo for NaN', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: Number.NaN,
    });
    expect(result.orderNo).toBeNull();
  });

  it('returns null orderNo for object', () => {
    const result = MetrologyService.buildMutationPayload({
      instrumentCode: 'C',
      instrumentName: 'N',
      orderNo: {} as unknown as number,
    });
    expect(result.orderNo).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — getList Where Clause
// ═══════════════════════════════════════════════

describe('metrologyService — getList where clause adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('trims whitespace from instrumentName filter', async () => {
    await MetrologyService.getList({ instrumentName: '  test  ' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.instrumentName).toEqual({ contains: 'test' });
  });

  it('trims whitespace from instrumentCode filter', async () => {
    await MetrologyService.getList({ instrumentCode: '  CODE  ' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.instrumentCode).toEqual({ contains: 'CODE' });
  });

  it('trims whitespace from model filter', async () => {
    await MetrologyService.getList({ model: '  M  ' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.model).toEqual({ contains: 'M' });
  });

  it('trims whitespace from usingUnit filter', async () => {
    await MetrologyService.getList({ usingUnit: '  BU  ' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.usingUnit).toEqual({ contains: 'BU' });
  });

  it('omits instrumentName when whitespace-only', async () => {
    await MetrologyService.getList({ instrumentName: '   ' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.instrumentName).toBeUndefined();
  });

  it('omits instrumentCode when whitespace-only', async () => {
    await MetrologyService.getList({ instrumentCode: '   ' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.instrumentCode).toBeUndefined();
  });

  it('always sets isDeleted: false in where', async () => {
    await MetrologyService.getList({});
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.isDeleted).toBe(false);
  });

  it('applies both validFrom and validTo creating range filter', async () => {
    await MetrologyService.getList({
      validFrom: '2025-01-01',
      validTo: '2025-12-31',
    });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    expect(call.where.validUntil.gte).toEqual(
      new Date('2025-01-01T00:00:00.000Z'),
    );
    expect(call.where.validUntil.lte).toEqual(
      new Date('2025-12-31T23:59:59.999Z'),
    );
  });

  it('builds EXPIRED where with validUntil filter', async () => {
    await MetrologyService.getList({ inspectionStatus: 'EXPIRED' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    const and = call.where.AND;
    expect(and).toBeDefined();
    expect(and.length).toBeGreaterThanOrEqual(1);
  });

  it('builds PENDING where with validUntil gte today', async () => {
    await MetrologyService.getList({ inspectionStatus: 'PENDING' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    const and = call.where.AND;
    expect(and).toBeDefined();
  });

  it('builds VALID where with validUntil gt pendingUntil', async () => {
    await MetrologyService.getList({ inspectionStatus: 'VALID' });
    const call = mockPrisma.measuring_instruments.count.mock.calls[0][0];
    const and = call.where.AND;
    expect(and).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — getOverview Edge Cases
// ═══════════════════════════════════════════════

describe('metrologyService — getOverview adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts all items with mixed statuses', async () => {
    const now = new Date();
    const farFuture = new Date(now);
    farFuture.setFullYear(farFuture.getFullYear() + 5);
    const nearFuture = new Date(now);
    nearFuture.setDate(nearFuture.getDate() + 15);
    const past = new Date(now);
    past.setFullYear(past.getFullYear() - 1);

    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({
        id: 'd1',
        inspectionStatus: 'DISABLED',
        validUntil: farFuture,
      }),
      makeInstrument({ id: 'e1', inspectionStatus: '', validUntil: past }),
      makeInstrument({
        id: 'p1',
        inspectionStatus: '',
        validUntil: nearFuture,
      }),
      makeInstrument({ id: 'v1', inspectionStatus: '', validUntil: farFuture }),
      makeInstrument({ id: 'p2', inspectionStatus: '', validUntil: null }),
    ]);

    const result = await MetrologyService.getOverview({});
    expect(result.totalCount).toBe(5);
    expect(result.disabledCount).toBe(1);
    expect(result.expiredCount).toBe(1);
    expect(result.expiringSoonCount).toBe(2);
    expect(result.validCount).toBe(1);
  });

  it('returns zero counts for single DISABLED item', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({
        inspectionStatus: 'DISABLED',
        validUntil: new Date('2030-01-01'),
      }),
    ]);
    const result = await MetrologyService.getOverview({});
    expect(result.disabledCount).toBe(1);
    expect(result.expiredCount).toBe(0);
    expect(result.expiringSoonCount).toBe(0);
    expect(result.validCount).toBe(0);
    expect(result.totalCount).toBe(1);
  });

  it('does not apply inspectionStatus filter (overview ignores it)', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    await MetrologyService.getOverview({ inspectionStatus: 'DISABLED' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.where.AND).toBeUndefined();
  });

  it('uses select with only needed fields', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    await MetrologyService.getOverview({});
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.select).toBeDefined();
    expect(call.select.borrowStatus).toBe(true);
    expect(call.select.validUntil).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Sort Field Mapping
// ═══════════════════════════════════════════════

describe('metrologyService — sort field mapping adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('sortBy=inspectionStatusLabel maps to inspectionStatus', async () => {
    await MetrologyService.getList({
      sortBy: 'inspectionStatusLabel',
      sortOrder: 'desc',
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ inspectionStatus: 'desc' });
  });

  it('sortBy=remainingDays maps to validUntil', async () => {
    await MetrologyService.getList({
      sortBy: 'remainingDays',
      sortOrder: 'asc',
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ validUntil: 'asc' });
  });

  it('sortBy=orderNo maps to orderNo', async () => {
    await MetrologyService.getList({ sortBy: 'orderNo', sortOrder: 'asc' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ orderNo: 'asc' });
  });

  it('sortBy=usingUnit maps to usingUnit', async () => {
    await MetrologyService.getList({ sortBy: 'usingUnit', sortOrder: 'asc' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ usingUnit: 'asc' });
  });

  it('sortBy=model maps to model', async () => {
    await MetrologyService.getList({ sortBy: 'model', sortOrder: 'desc' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ model: 'desc' });
  });

  it('sortBy=instrumentName maps to instrumentName', async () => {
    await MetrologyService.getList({
      sortBy: 'instrumentName',
      sortOrder: 'asc',
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ instrumentName: 'asc' });
  });

  it('sortOrder defaults to asc when omitted', async () => {
    await MetrologyService.getList({ sortBy: 'instrumentCode' });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy[0]).toEqual({ instrumentCode: 'asc' });
  });

  it('default sort includes createdAt desc as secondary', async () => {
    await MetrologyService.getList({
      sortBy: 'instrumentCode',
      sortOrder: 'desc',
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.orderBy).toHaveLength(2);
    expect(call.orderBy[1]).toEqual({ createdAt: 'desc' });
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — Pagination Edge Cases
// ═══════════════════════════════════════════════

describe('metrologyService — pagination edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(0);
  });

  it('naN page defaults to 1', async () => {
    await MetrologyService.getList({ page: Number.NaN, pageSize: 10 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
  });

  it('naN pageSize defaults to 20', async () => {
    await MetrologyService.getList({ page: 1, pageSize: Number.NaN });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(20);
  });

  it('defaults string page "abc" to first page', async () => {
    await MetrologyService.getList({
      page: 'abc' as unknown as number,
      pageSize: 10,
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.skip).toBe(0);
  });

  it('defaults string pageSize "xyz" to 20', async () => {
    await MetrologyService.getList({
      page: 1,
      pageSize: 'xyz' as unknown as number,
    });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(20);
  });

  it('pageSize=1 is allowed', async () => {
    await MetrologyService.getList({ page: 1, pageSize: 1 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(1);
  });

  it('pageSize=100 is allowed (max boundary)', async () => {
    await MetrologyService.getList({ page: 1, pageSize: 100 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(100);
  });

  it('pageSize=101 is clamped to 100', async () => {
    await MetrologyService.getList({ page: 1, pageSize: 101 });
    const call = mockPrisma.measuring_instruments.findMany.mock.calls[0][0];
    expect(call.take).toBe(100);
  });

  it('very large page returns empty (skip beyond total)', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(5);
    const result = await MetrologyService.getList({ page: 9999, pageSize: 10 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(5);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — batchDelete Edge Cases
// ═══════════════════════════════════════════════

describe('metrologyService — batchDelete adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.measuring_instruments.updateMany.mockResolvedValue({ count: 0 });
  });

  it('does not include already-deleted items (isDeleted: false filter)', async () => {
    await MetrologyService.batchDelete(['a', 'b']);
    const call = mockPrisma.measuring_instruments.updateMany.mock.calls[0][0];
    expect(call.where.isDeleted).toBe(false);
  });

  it('sets updatedAt to current time', async () => {
    const before = Date.now();
    await MetrologyService.batchDelete(['a']);
    const call = mockPrisma.measuring_instruments.updateMany.mock.calls[0][0];
    const updatedAt = call.data.updatedAt as Date;
    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — buildListItem Edge Cases
// ═══════════════════════════════════════════════

describe('metrologyService — buildListItem adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null model → null', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ model: null }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);
    const result = await MetrologyService.getList({});
    expect(result.items[0].model).toBeNull();
  });

  it('handles null usingUnit → null', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ usingUnit: null }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);
    const result = await MetrologyService.getList({});
    expect(result.items[0].usingUnit).toBeNull();
  });

  it('handles null orderNo → null', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ orderNo: null }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);
    const result = await MetrologyService.getList({});
    expect(result.items[0].orderNo).toBeNull();
  });

  it('handles null sourceFileName → null', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ sourceFileName: null }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);
    const result = await MetrologyService.getList({});
    expect(result.items[0].sourceFileName).toBeNull();
  });

  it('normalizes RETURN_PENDING borrowStatus', async () => {
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ borrowStatus: 'RETURN_PENDING' }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);
    const result = await MetrologyService.getList({});
    expect(result.items[0].borrowStatus).toBe('RETURN_PENDING');
    expect(result.items[0].borrowStatusLabel).toBe('待确认归还');
  });

  it('returns correct remainingDays for far future (approx 365)', async () => {
    const d = new Date();
    d.setDate(d.getDate() + 365);
    d.setHours(0, 0, 0, 0);
    mockPrisma.measuring_instruments.findMany.mockResolvedValue([
      makeInstrument({ validUntil: d }),
    ]);
    mockPrisma.measuring_instruments.count.mockResolvedValue(1);
    const result = await MetrologyService.getList({});
    expect(result.items[0].remainingDays).toBeGreaterThanOrEqual(365);
    expect(result.items[0].remainingDays).toBeLessThanOrEqual(366);
  });
});

// ═══════════════════════════════════════════════
// Deep Adversarial — CRUD State Transitions
// ═══════════════════════════════════════════════

describe('metrologyService — CRUD adversarial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('create: does not set createdBy/updatedBy when empty string', async () => {
    mockPrisma.measuring_instruments.create.mockResolvedValue({} as never);
    await MetrologyService.create(
      { instrumentCode: 'C', instrumentName: 'N' },
      '',
    );
    const call = mockPrisma.measuring_instruments.create.mock.calls[0][0];
    expect(call.data.createdBy).toBeNull();
    expect(call.data.updatedBy).toBeNull();
  });

  it('updateById: does not set updatedBy when empty string', async () => {
    mockPrisma.measuring_instruments.update.mockResolvedValue({} as never);
    await MetrologyService.updateById(
      'mi-1',
      { instrumentCode: 'C', instrumentName: 'N' },
      '',
    );
    const call = mockPrisma.measuring_instruments.update.mock.calls[0][0];
    expect(call.data.updatedBy).toBeNull();
  });

  it('deleteById: sets updatedAt to current time', async () => {
    mockPrisma.measuring_instruments.update.mockResolvedValue({} as never);
    const before = Date.now();
    await MetrologyService.deleteById('mi-1');
    const call = mockPrisma.measuring_instruments.update.mock.calls[0][0];
    expect((call.data.updatedAt as Date).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
  });

  it('batchDelete with single ID', async () => {
    mockPrisma.measuring_instruments.updateMany.mockResolvedValue({ count: 1 });
    await MetrologyService.batchDelete(['only-one'], 'admin');
    const call = mockPrisma.measuring_instruments.updateMany.mock.calls[0][0];
    expect(call.where.id).toEqual({ in: ['only-one'] });
  });
});
