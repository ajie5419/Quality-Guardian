import { describe, expect, it } from 'vitest';

import { buildAfterSalesCreateRequestFingerprint } from './after-sales-create-fingerprint';

const baseBody = {
  customerName: '客户甲',
  defectCategoryId: 'dc-1',
  defectSubcategoryId: 'dsc-1',
  issueDescription: '外观划伤',
  materialCost: 100,
  occurDate: '2026-08-20',
  projectName: '项目甲',
  quantity: 2,
  responsibleDept: '品质部',
  supplierBrandId: 'brand-1',
  workOrderNumber: 'WO-2026-001',
};

describe('buildAfterSalesCreateRequestFingerprint', () => {
  it('is stable for the same logical request', () => {
    const first = buildAfterSalesCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p1.jpg', '/p2.jpg'],
    });
    const second = buildAfterSalesCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p2.jpg', '/p1.jpg'],
    });
    expect(second).toBe(first);
  });

  it('changes when a business field changes', () => {
    const first = buildAfterSalesCreateRequestFingerprint(baseBody);
    const changed = buildAfterSalesCreateRequestFingerprint({
      ...baseBody,
      workOrderNumber: 'WO-2026-002',
    });
    expect(changed).not.toBe(first);
  });

  it('ignores photo order but not the set', () => {
    const first = buildAfterSalesCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p1.jpg', '/p2.jpg'],
    });
    const reordered = buildAfterSalesCreateRequestFingerprint({
      ...baseBody,
      photos: ['/p2.jpg', '/p1.jpg'],
    });
    expect(reordered).toBe(first);
  });

  it('excludes the serial number', () => {
    const first = buildAfterSalesCreateRequestFingerprint(baseBody);
    const withSerial = buildAfterSalesCreateRequestFingerprint({
      ...baseBody,
      serialNumber: 42,
    });
    expect(withSerial).toBe(first);
  });
});
