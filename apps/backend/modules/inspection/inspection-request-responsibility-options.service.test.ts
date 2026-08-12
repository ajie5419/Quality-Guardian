import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeptService } from '~/modules/dept';
import { SupplierService } from '~/modules/supplier';

import { InspectionRequestResponsibilityOptionsService } from './inspection-request-responsibility-options.service';

vi.mock('~/modules/dept', () => ({
  DeptService: { listActiveOptions: vi.fn() },
}));

vi.mock('~/modules/supplier', () => ({
  SupplierService: { listActiveOptions: vi.fn() },
}));

describe('inspection request responsibility options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DeptService.listActiveOptions).mockResolvedValue([
      { label: 'Quality Department', value: 'dept-quality' },
    ]);
    vi.mocked(SupplierService.listActiveOptions).mockResolvedValue([
      { label: 'Supplier A', value: 'supplier-a' },
    ]);
  });

  it.each([
    ['INTERNAL_DEPARTMENT', undefined],
    ['SUPPLIER', 'Supplier'],
    ['OUTSOURCING_UNIT', 'Outsourcing'],
  ] as const)(
    'returns every active department for %s and only its matching suppliers',
    async (responsibilityType, supplierCategory) => {
      const result = await InspectionRequestResponsibilityOptionsService.list({
        keyword: 'quality',
        responsibilityType,
      });

      expect(DeptService.listActiveOptions).toHaveBeenCalledWith('quality');
      expect(result.departments).toEqual([
        { label: 'Quality Department', value: 'dept-quality' },
      ]);
      if (supplierCategory) {
        expect(SupplierService.listActiveOptions).toHaveBeenCalledWith({
          category: supplierCategory,
          keyword: 'quality',
        });
        expect(result.suppliers).toHaveLength(1);
      } else {
        expect(SupplierService.listActiveOptions).not.toHaveBeenCalled();
        expect(result.suppliers).toEqual([]);
      }
    },
  );
});
