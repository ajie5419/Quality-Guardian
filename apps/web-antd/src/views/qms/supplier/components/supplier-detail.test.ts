import { describe, expect, it } from 'vitest';

import {
  formatIncomingQualifiedRate,
  hasIncomingQualifiedRate,
  hasInspectionBatches,
} from './supplier-detail';

describe('supplier detail presentation', () => {
  it('shows no qualified rate when the supplier has no inspection batches', () => {
    expect(formatIncomingQualifiedRate(0, 100)).toBe('-');
    expect(formatIncomingQualifiedRate(undefined, undefined)).toBe('-');
    expect(hasInspectionBatches(0)).toBe(false);
  });

  it('shows the qualified rate when inspection batches exist', () => {
    expect(formatIncomingQualifiedRate(3, 92)).toBe(92);
    expect(hasIncomingQualifiedRate(3, 92)).toBe(true);
    expect(hasInspectionBatches(3)).toBe(true);
  });

  it('does not render an invalid qualified rate', () => {
    expect(formatIncomingQualifiedRate(2, undefined)).toBe('-');
    expect(formatIncomingQualifiedRate(2, null)).toBe('-');
    expect(hasIncomingQualifiedRate(2, undefined)).toBe(false);
  });
});
