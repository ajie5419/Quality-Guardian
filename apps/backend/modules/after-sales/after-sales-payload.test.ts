import { describe, expect, it, vi } from 'vitest';
import { buildGovernedCanonicalWritePairForTable } from '~/utils/governed-write';

import {
  buildGovernedAfterSalesCreateData,
  buildGovernedAfterSalesUpdateData,
} from './after-sales-payload';

vi.mock('~/utils/governed-write', () => ({
  buildGovernedCanonicalWritePairForTable: vi.fn(
    async (_table: string, data: Record<string, unknown>) => {
      if (data.supplierBrandId !== undefined) {
        return { supplierBrandId: data.supplierBrandId };
      }
      if (data.supplierBrand) {
        return { supplierBrandId: `supplier:${String(data.supplierBrand)}` };
      }
      return {};
    },
  ),
}));

describe('after-sales payload governance helpers', () => {
  it('builds governed create payload without runtime reference error', async () => {
    await expect(
      buildGovernedAfterSalesCreateData(
        {
          customerName: 'ACME',
          defectSubtype: '平板车',
          defectType: '焊接缺陷',
          partName: '阿萨德',
          projectName: '阿斯蒂芬',
          responsibleDepartment: '生产 OBU',
          workOrderNumber: 'WO-808512',
        },
        {
          defaultWorkOrderNumber: 'UNKNOWN',
          id: 'AS-UT-001',
          serialNumber: 1,
        },
      ),
    ).resolves.toMatchObject({
      id: 'AS-UT-001',
      workOrderNumber: 'WO-808512',
    });
  });

  it('serializes responsibleDepartments and keeps legacy fields on create', async () => {
    await expect(
      buildGovernedAfterSalesCreateData(
        {
          projectName: 'Project',
          responsibleDept: '质量部',
          responsibleDepartments: ['售后部', '技术部'],
          workOrderNumber: 'WO-808512',
        },
        {
          defaultWorkOrderNumber: 'UNKNOWN',
          id: 'AS-UT-002',
          serialNumber: 2,
        },
      ),
    ).resolves.toMatchObject({
      feedbackDept: '售后部',
      respDept: '售后部',
      responsibleDepartments: JSON.stringify(['售后部', '技术部']),
    });
  });

  it('writes canonical supplier ID on create', async () => {
    await expect(
      buildGovernedAfterSalesCreateData(
        {
          supplierBrand: 'Supplier A',
          workOrderNumber: 'WO-808512',
        },
        {
          defaultWorkOrderNumber: 'UNKNOWN',
          id: 'AS-UT-003',
          serialNumber: 3,
        },
      ),
    ).resolves.toMatchObject({
      supplierBrand: 'Supplier A',
      supplierBrandId: 'supplier:Supplier A',
    });
  });

  it('preserves explicit supplier ID for canonical validation on create', async () => {
    await expect(
      buildGovernedAfterSalesCreateData(
        {
          supplierBrand: 'Supplier A',
          supplierBrandId: 'supplier-1',
          workOrderNumber: 'WO-808512',
        },
        {
          defaultWorkOrderNumber: 'UNKNOWN',
          id: 'AS-UT-004',
          serialNumber: 4,
        },
      ),
    ).resolves.toMatchObject({
      supplierBrand: 'Supplier A',
      supplierBrandId: 'supplier-1',
    });
    expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
      'after_sales',
      expect.objectContaining({
        supplierBrand: 'Supplier A',
        supplierBrandId: 'supplier-1',
      }),
    );
  });

  it('builds governed update payload without runtime reference error', async () => {
    await expect(
      buildGovernedAfterSalesUpdateData({
        customerName: 'ACME',
        defectSubtype: '平板车',
        defectType: '焊接缺陷',
        responsibleDepartment: '生产 OBU',
      }),
    ).resolves.toMatchObject({
      costsChanged: false,
      data: expect.any(Object),
    });
  });

  it('serializes responsibleDepartments and keeps legacy fields on update', async () => {
    await expect(
      buildGovernedAfterSalesUpdateData({
        responsibleDept: '质量部',
        responsibleDepartments: ['生产部', '工艺部'],
      }),
    ).resolves.toMatchObject({
      costsChanged: false,
      data: {
        feedbackDept: '生产部',
        respDept: '生产部',
        responsibleDepartments: JSON.stringify(['生产部', '工艺部']),
      },
    });
  });

  it('updates and clears canonical supplier ID with supplier name', async () => {
    await expect(
      buildGovernedAfterSalesUpdateData({ supplierBrand: 'Supplier B' }),
    ).resolves.toMatchObject({
      data: {
        supplierBrand: 'Supplier B',
        supplierBrandId: 'supplier:Supplier B',
      },
    });
    await expect(
      buildGovernedAfterSalesUpdateData({ supplierBrand: '' }),
    ).resolves.toMatchObject({
      data: {
        supplierBrand: null,
        supplierBrandId: null,
      },
    });
  });

  it('preserves explicit supplier ID for canonical validation on update', async () => {
    await expect(
      buildGovernedAfterSalesUpdateData({
        supplierBrand: 'Supplier B',
        supplierBrandId: 'supplier-2',
      }),
    ).resolves.toMatchObject({
      data: {
        supplierBrand: 'Supplier B',
        supplierBrandId: 'supplier-2',
      },
    });
    expect(buildGovernedCanonicalWritePairForTable).toHaveBeenCalledWith(
      'after_sales',
      expect.objectContaining({
        supplierBrand: 'Supplier B',
        supplierBrandId: 'supplier-2',
      }),
    );
  });
});
