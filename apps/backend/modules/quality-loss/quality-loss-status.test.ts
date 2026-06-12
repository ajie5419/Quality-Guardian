import { describe, expect, it } from 'vitest';
import {
  normalizeQualityLossSource,
  normalizeQualityLossStatus,
  parseQualityLossStatus,
  toAfterSalesClaimStatus,
  toQualityLossTargetType,
  toQualityRecordStatus,
} from '~/modules/quality-loss/quality-loss-status';

describe('quality-loss status helpers', () => {
  it('normalizes unified quality loss statuses', () => {
    expect(normalizeQualityLossStatus('confirmed')).toBe('Confirmed');
    expect(normalizeQualityLossStatus('completed')).toBe('Confirmed');
    expect(normalizeQualityLossStatus('pending')).toBe('Pending');
    expect(normalizeQualityLossStatus(undefined)).toBe('Pending');
  });

  it('strictly parses only known quality loss statuses', () => {
    expect(parseQualityLossStatus('confirmed')).toBe('Confirmed');
    expect(parseQualityLossStatus('unexpected')).toBeNull();
  });

  it('maps unified status to source table statuses', () => {
    expect(toAfterSalesClaimStatus('confirmed')).toBe('COMPLETED');
    expect(toAfterSalesClaimStatus('pending')).toBe('OPEN');
    expect(toQualityRecordStatus('confirmed')).toBe('CLOSED');
    expect(toQualityRecordStatus('pending')).toBe('OPEN');
  });

  it('normalizes source labels and maps them to target table types', () => {
    expect(normalizeQualityLossSource('manual')).toBe('Manual');
    expect(normalizeQualityLossSource('internal')).toBe('Internal');
    expect(normalizeQualityLossSource('external')).toBe('External');
    expect(normalizeQualityLossSource('commissioning')).toBe('Commissioning');
    expect(toQualityLossTargetType('Manual')).toBe('quality_loss');
    expect(toQualityLossTargetType('Internal')).toBe('inspection_issue');
    expect(toQualityLossTargetType('External')).toBe('after_sales');
    expect(toQualityLossTargetType('Commissioning')).toBe(
      'vehicle_commissioning_issue',
    );
  });
});
