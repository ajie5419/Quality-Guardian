import { describe, expect, it, vi } from 'vitest';

import { QUALITY_LOSS_SOURCE } from './quality-loss-status';
import {
  parseQualityLossUpdateBody,
  resolveQualityLossUpdateTarget,
} from './quality-loss-update';

describe('quality-loss update utils', () => {
  it('parses optional update fields with validation', () => {
    const parsed = parseQualityLossUpdateBody({
      actualClaim: '12.5',
      amount: '100',
      date: '2026-01-03',
      responsibleDepartment: ' QA ',
      status: 'completed',
      type: '  Material ',
    });

    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      expect(parsed.actualClaim).toBe(12.5);
      expect(parsed.amount).toBe(100);
      expect(parsed.occurDate).toBeInstanceOf(Date);
      expect(parsed.respDept).toBe('QA');
      expect(parsed.status).toBe('Confirmed');
      expect(parsed.type).toBe('Material');
    }
  });

  it('returns validation error for invalid numeric/date fields', () => {
    const invalidNumber = parseQualityLossUpdateBody({ amount: 'abc' });
    expect(invalidNumber.valid).toBe(false);

    const invalidDate = parseQualityLossUpdateBody({ date: 'not-a-date' });
    expect(invalidDate.valid).toBe(false);
  });

  it('resolves prefixed source target id with serial lookup', async () => {
    const client = {
      after_sales: {
        findFirst: vi.fn().mockResolvedValue({ id: 'as-1' }),
      },
      quality_records: {
        findFirst: vi.fn().mockResolvedValue({ id: 'qr-1' }),
      },
    };

    const internal = await resolveQualityLossUpdateTarget({
      client,
      pathId: 'INT-7',
      pk: undefined,
      source: QUALITY_LOSS_SOURCE.INTERNAL,
    });
    expect(internal.valid).toBe(true);
    if (internal.valid) {
      expect(internal.where).toEqual({ id: 'qr-1' });
    }

    const external = await resolveQualityLossUpdateTarget({
      client,
      pathId: 'EXT-8',
      pk: undefined,
      source: QUALITY_LOSS_SOURCE.EXTERNAL,
    });
    expect(external.valid).toBe(true);
    if (external.valid) {
      expect(external.where).toEqual({ id: 'as-1' });
    }
  });

  it('rejects source/id mismatch', async () => {
    const client = {
      after_sales: { findFirst: vi.fn() },
      quality_records: { findFirst: vi.fn() },
    };
    const result = await resolveQualityLossUpdateTarget({
      client,
      pathId: 'EXT-8',
      pk: undefined,
      source: QUALITY_LOSS_SOURCE.INTERNAL,
    });
    expect(result.valid).toBe(false);
  });
});
