import { describe, expect, it } from 'vitest';

import {
  buildItpProjectCreateData,
  buildItpProjectUpdateData,
  normalizeItpPlanStatus,
  stringifyItpQuantitativeItems,
} from './itp';

describe('itp utils', () => {
  it('normalizes plan status and falls back to DRAFT', () => {
    expect(normalizeItpPlanStatus('approved')).toBe('APPROVED');
    expect(normalizeItpPlanStatus('unknown')).toBe('DRAFT');
  });

  it('builds project create data with defaults', () => {
    const data = buildItpProjectCreateData(
      { projectName: 'P1', workOrderId: 'WO-1' },
      { preparedBy: 'alice' },
    );

    expect(String(data.id).startsWith('ITP-PROJ-')).toBe(true);
    expect(data.projectName).toBe('P1');
    expect(data.workOrderNumber).toBe('WO-1');
    expect(data.customer).toBe('Default Customer');
    expect(data.preparedBy).toBe('alice');
    expect(data.planStatus).toBe('DRAFT');
  });

  it('builds update data only for provided fields', () => {
    const data = buildItpProjectUpdateData({
      customerName: 'C1',
      status: 'active',
    });

    expect(data.planStatus).toBe('ACTIVE');
    expect(data.customer).toBe('C1');
    expect(data.updatedAt).toBeInstanceOf(Date);
    expect((data as Record<string, unknown>).projectName).toBeUndefined();
  });

  it('stringifies quantitative items robustly', () => {
    expect(stringifyItpQuantitativeItems('[1,2]')).toBe('[1,2]');
    expect(stringifyItpQuantitativeItems('invalid-json')).toBe('[]');
  });
});
