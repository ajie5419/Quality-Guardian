import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '~/modules/inspection/inspection-record-import.post.service';
import { InspectionService } from '~/modules/inspection/inspection.service';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';

vi.mock('h3', () => ({
  defineEventHandler: (fn: any) => fn,
  readBody: vi.fn(),
}));

vi.mock('~/modules/file-storage/import-report', () => ({
  buildImportRowError: vi
    .fn()
    .mockReturnValue({ field: 'serialNumber', reason: 'err', row: 1 }),
  buildImportSummary: vi
    .fn()
    .mockReturnValue({ successCount: 0, totalCount: 0, rowErrors: [] }),
  inferImportErrorField: vi.fn().mockReturnValue('serialNumber'),
  toImportErrorMessage: vi.fn().mockReturnValue('import error'),
}));

vi.mock('~/modules/inspection/inspection.service', () => ({
  InspectionService: {
    create: vi.fn(),
  },
}));

vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSupplierById: vi
      .fn()
      .mockResolvedValue({ id: 'supplier-1', name: 'Supplier A' }),
    resolveTeamById: vi
      .fn()
      .mockResolvedValue({ id: 'team-1', name: 'Team A' }),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi
    .fn()
    .mockResolvedValue({ supplierId: 'supplier-1' }),
}));

vi.mock('~/utils/api-logger', () => ({
  logApiError: vi.fn(),
}));

vi.mock('~/utils/request-validation', () => ({
  parseNonEmptyArray: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  badRequestResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 400,
      message: msg,
    })),
  internalServerErrorResponse: vi
    .fn()
    .mockImplementation((_event: any, msg: string) => ({
      statusCode: 500,
      message: msg,
    })),
  useResponseSuccess: vi.fn().mockImplementation((data: any) => ({
    data,
    statusCode: 200,
  })),
}));

describe('inspectionRecordImportPostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SupplierIdentityService.resolveTeamById).mockResolvedValue({
      id: 'team-1',
      name: 'Team A',
    });
  });

  it('should return badRequestResponse when items is empty', async () => {
    const { readBody } = await import('h3');
    const { parseNonEmptyArray } = await import('~/utils/request-validation');

    (readBody as any).mockResolvedValue({ items: [], category: 'PROCESS' });
    (parseNonEmptyArray as any).mockReturnValue(null);

    const result: any = await handler({} as any);

    expect(result.statusCode).toBe(400);
    expect(result.message).toBe('未发现可导入的数据');
  });

  it('should create each item and return success summary', async () => {
    const { readBody } = await import('h3');
    const { parseNonEmptyArray } = await import('~/utils/request-validation');
    const { buildImportSummary } = await import(
      '~/modules/file-storage/import-report'
    );

    const items = [
      { serialNumber: 'SN-1', inspector: 'A', teamId: 'team-1' },
      { serialNumber: 'SN-2', inspector: 'B', teamId: 'team-1' },
    ];
    (readBody as any).mockResolvedValue({ items, category: 'PROCESS' });
    (parseNonEmptyArray as any).mockReturnValue(items);
    (InspectionService.create as any).mockResolvedValue({ id: '1' });
    (buildImportSummary as any).mockReturnValue({
      successCount: 2,
      totalCount: 2,
      rowErrors: [],
    });

    const result = await handler({} as any);

    expect(InspectionService.create).toHaveBeenCalledTimes(2);
    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ team: 'Team A', teamId: 'team-1' }),
    );
    expect(result.data.successCount).toBe(2);
    expect(result.data.totalCount).toBe(2);
  });

  it('should collect row errors when some items fail', async () => {
    const { readBody } = await import('h3');
    const { parseNonEmptyArray } = await import('~/utils/request-validation');
    const { buildImportSummary } = await import(
      '~/modules/file-storage/import-report'
    );

    const items = [
      { serialNumber: 'SN-1', inspector: 'A', teamId: 'team-1' },
      { serialNumber: 'SN-2', inspector: 'B', teamId: 'team-1' },
    ];
    (readBody as any).mockResolvedValue({ items, category: 'PROCESS' });
    (parseNonEmptyArray as any).mockReturnValue(items);
    (InspectionService.create as any)
      .mockResolvedValueOnce({ id: '1' })
      .mockRejectedValueOnce(new Error('duplicate'));
    (buildImportSummary as any).mockReturnValue({
      successCount: 1,
      totalCount: 2,
      rowErrors: [{ row: 2, reason: 'import error' }],
    });

    const result = await handler({} as any);

    expect(InspectionService.create).toHaveBeenCalledTimes(2);
    expect(result.data.successCount).toBe(1);
    expect(result.data.rowErrors).toHaveLength(1);
  });

  it('should return internalServerErrorResponse when body parsing fails', async () => {
    const { readBody } = await import('h3');
    (readBody as any).mockRejectedValue(new Error('invalid body'));

    const result: any = await handler({} as any);

    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('数据解析失败');
  });

  it('should normalize category from body', async () => {
    const { readBody } = await import('h3');
    const { parseNonEmptyArray } = await import('~/utils/request-validation');
    const { buildImportSummary } = await import(
      '~/modules/file-storage/import-report'
    );

    const items = [{ serialNumber: 'SN-1', inspector: 'A' }];
    (readBody as any).mockResolvedValue({ items, category: 'SHIPMENT' });
    (parseNonEmptyArray as any).mockReturnValue(items);
    (InspectionService.create as any).mockResolvedValue({ id: '1' });
    (buildImportSummary as any).mockReturnValue({
      successCount: 1,
      totalCount: 1,
      rowErrors: [],
    });

    await handler({} as any);

    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'SHIPMENT' }),
    );
  });

  it('resolves incoming supplier names only in the reviewed import adapter', async () => {
    const { readBody } = await import('h3');
    const { parseNonEmptyArray } = await import('~/utils/request-validation');
    const { buildImportSummary } = await import(
      '~/modules/file-storage/import-report'
    );
    const items = [{ supplierName: 'Supplier A' }];
    (readBody as any).mockResolvedValue({ items, category: 'INCOMING' });
    (parseNonEmptyArray as any).mockReturnValue(items);
    (InspectionService.create as any).mockResolvedValue({ id: '1' });
    (buildImportSummary as any).mockReturnValue({
      successCount: 1,
      totalCount: 1,
      rowErrors: [],
    });

    await handler({} as any);

    expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
      'inspections',
      items[0],
      { mode: 'legacy-import' },
    );
    expect(InspectionService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
      }),
    );
  });

  it('returns a row error when a process row omits its canonical TEAM ID', async () => {
    const { readBody } = await import('h3');
    const { parseNonEmptyArray } = await import('~/utils/request-validation');
    const { buildImportSummary } = await import(
      '~/modules/file-storage/import-report'
    );
    const items = [{ team: 'Unknown Team' }];
    (readBody as any).mockResolvedValue({ items, category: 'PROCESS' });
    (parseNonEmptyArray as any).mockReturnValue(items);
    (buildImportSummary as any).mockReturnValue({
      successCount: 0,
      totalCount: 1,
      rowErrors: [{ reason: 'import error', row: 1 }],
    });

    const result = await handler({} as any);

    expect(InspectionService.create).not.toHaveBeenCalled();
    expect(result.data.rowErrors).toHaveLength(1);
  });
});
