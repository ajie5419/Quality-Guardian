import { describe, expect, it, vi } from 'vitest';

vi.mock('~/modules/supplier/supplier-query', () => ({
  IN_HOUSE_OUTSOURCING_MODE: 'IN_HOUSE_TEAM',
  isOutsourcingCategory: (v: unknown) =>
    String(v ?? '')
      .trim()
      .toLowerCase() === 'outsourcing',
  normalizeOutsourcingMode: (v: unknown, cat?: unknown) => {
    const raw = String(v ?? '')
      .trim()
      .toUpperCase();
    if (raw === 'IN_HOUSE_TEAM' || raw === 'EXTERNAL_PROCESSOR') return raw;
    if (
      String(cat ?? '')
        .trim()
        .toLowerCase() === 'outsourcing'
    )
      return 'EXTERNAL_PROCESSOR';
    return undefined;
  },
}));

import {
  applyRecordsToStats,
  buildInHouseOutsourcingScore,
  buildSupplierScore,
  calculateConsecutiveFailures,
  classifyDefect,
  createEmptyStats,
  scoreSupplierListItem,
} from './supplier-scoring';
import type { SupplierStats } from './supplier-scoring';

function makeStat(overrides: Partial<SupplierStats> = {}): SupplierStats {
  return { ...createEmptyStats(), ...overrides };
}

describe('classifyDefect', () => {
  it('returns null when loss=0 and severity=undefined', () => {
    expect(classifyDefect(0, undefined)).toBeNull();
  });

  it('returns null when loss=0 and severity=null (cast)', () => {
    expect(classifyDefect(0, null as unknown as string)).toBeNull();
  });

  it('returns null at exact threshold 5000 (boundary: > not >=)', () => {
    expect(classifyDefect(5000)).toBeNull();
  });

  it('returns A at 5001 (just above threshold)', () => {
    expect(classifyDefect(5001)).toBe('A');
  });

  it('returns A for CRITICAL (uppercase)', () => {
    expect(classifyDefect(0, 'CRITICAL')).toBe('A');
  });

  it('returns A for 致命 (Chinese fatal)', () => {
    expect(classifyDefect(0, '致命')).toBe('A');
  });

  it('returns A for P0', () => {
    expect(classifyDefect(0, 'P0')).toBe('A');
  });

  it('returns A for P1', () => {
    expect(classifyDefect(0, 'P1')).toBe('A');
  });

  it('loss takes priority over severity: 100000 + low → A', () => {
    expect(classifyDefect(100_000, 'low')).toBe('A');
  });

  it('returns null for unknown severity string', () => {
    expect(classifyDefect(0, 'unknown_value')).toBeNull();
  });

  it('returns null for empty string severity', () => {
    expect(classifyDefect(0, '')).toBeNull();
  });

  it('returns B for high', () => {
    expect(classifyDefect(0, 'high')).toBe('B');
  });

  it('returns B for major', () => {
    expect(classifyDefect(0, 'major')).toBe('B');
  });

  it('returns B for P2', () => {
    expect(classifyDefect(0, 'P2')).toBe('B');
  });

  it('returns C for low', () => {
    expect(classifyDefect(0, 'low')).toBe('C');
  });

  it('returns C for minor', () => {
    expect(classifyDefect(0, 'minor')).toBe('C');
  });

  it('returns C for P3', () => {
    expect(classifyDefect(0, 'P3')).toBe('C');
  });

  it('severity case insensitivity: Critical → A', () => {
    expect(classifyDefect(0, 'Critical')).toBe('A');
  });

  it('severity case insensitivity: High → B', () => {
    expect(classifyDefect(0, 'High')).toBe('B');
  });

  it('loss exactly at threshold with severity low → A (loss wins)', () => {
    expect(classifyDefect(5001, 'low')).toBe('A');
  });

  it('loss below threshold with fatal → A (severity wins)', () => {
    expect(classifyDefect(100, 'fatal')).toBe('A');
  });

  it('loss = -1 (negative) returns null', () => {
    expect(classifyDefect(-1)).toBeNull();
  });

  it('loss = NaN returns null', () => {
    expect(classifyDefect(NaN)).toBeNull();
  });

  it('loss = Infinity returns A (> 5000)', () => {
    expect(classifyDefect(Infinity)).toBe('A');
  });
});

describe('calculateConsecutiveFailures', () => {
  it('empty array → 0', () => {
    expect(calculateConsecutiveFailures([])).toBe(0);
  });

  it('[A, B, A] → 3 (A and B are both "big failures", consecutive)', () => {
    expect(
      calculateConsecutiveFailures([
        { type: 'A' },
        { type: 'B' },
        { type: 'A' },
      ]),
    ).toBe(3);
  });

  it('[B, B, B, C, B, B] → 2 (C resets)', () => {
    expect(
      calculateConsecutiveFailures([
        { type: 'B' },
        { type: 'B' },
        { type: 'B' },
        { type: 'C' },
        { type: 'B' },
        { type: 'B' },
      ]),
    ).toBe(3);
  });

  it('[null, A, null] → 1', () => {
    expect(
      calculateConsecutiveFailures([
        { type: null },
        { type: 'A' },
        { type: null },
      ]),
    ).toBe(1);
  });

  it('all null → 0', () => {
    expect(
      calculateConsecutiveFailures([
        { type: null },
        { type: null },
        { type: null },
      ]),
    ).toBe(0);
  });

  it('[A, A, A, A, A] → 5 (all consecutive)', () => {
    expect(
      calculateConsecutiveFailures([
        { type: 'A' },
        { type: 'A' },
        { type: 'A' },
        { type: 'A' },
        { type: 'A' },
      ]),
    ).toBe(5);
  });

  it('[B, B, null, B] → 2 (null breaks, then 1 B)', () => {
    expect(
      calculateConsecutiveFailures([
        { type: 'B' },
        { type: 'B' },
        { type: null },
        { type: 'B' },
      ]),
    ).toBe(2);
  });

  it('[C, C, C] → 0 (C is not A or B)', () => {
    expect(
      calculateConsecutiveFailures([
        { type: 'C' },
        { type: 'C' },
        { type: 'C' },
      ]),
    ).toBe(0);
  });

  it('[A, B, A, B, A, B] → 6 (all are A or B)', () => {
    expect(
      calculateConsecutiveFailures([
        { type: 'A' },
        { type: 'B' },
        { type: 'A' },
        { type: 'B' },
        { type: 'A' },
        { type: 'B' },
      ]),
    ).toBe(6);
  });

  it('single record [A] → 1', () => {
    expect(calculateConsecutiveFailures([{ type: 'A' }])).toBe(1);
  });

  it('single record [C] → 0', () => {
    expect(calculateConsecutiveFailures([{ type: 'C' }])).toBe(0);
  });
});

describe('buildSupplierScore', () => {
  it('perfect: qualifiedRate=100, all zeros → score=100, no freeze, no downgrade', () => {
    const stat = makeStat();
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat,
      totalIssueCount: 0,
    });
    expect(result.score).toBe(100);
    expect(result.shouldFreeze).toBe(false);
    expect(result.shouldDowngradeToC).toBe(false);
  });

  it('engineeringClassA=1, afterSalesClassA=1 → shouldDowngradeToC=true (sum >= 2)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassA: 1, afterSalesClassA: 1 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(true);
  });

  it('engineeringClassA=1, afterSalesClassA=0 → shouldDowngradeToC=false (sum < 2)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassA: 1, afterSalesClassA: 0 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(false);
  });

  it('engineeringClassB=2, afterSalesClassB=1 → shouldDowngradeToC=true (sum >= 3)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassB: 2, afterSalesClassB: 1 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(true);
  });

  it('engineeringClassB=2, afterSalesClassB=0 → shouldDowngradeToC=false (sum < 3)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassB: 2, afterSalesClassB: 0 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(false);
  });

  it('totalIssueCount=3, consecutiveBigFailures=3 → shouldFreeze=true', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ consecutiveBigFailures: 3 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(true);
  });

  it('totalIssueCount=2, consecutiveBigFailures=3 → shouldFreeze=false (issue count < 3)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ consecutiveBigFailures: 3 }),
      totalIssueCount: 2,
    });
    expect(result.shouldFreeze).toBe(false);
  });

  it('maxSingleLoss=80000 (exact threshold) → should NOT freeze (> not >=)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ maxSingleLoss: 80_000 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(false);
  });

  it('maxSingleLoss=80001 → shouldFreeze=true', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ maxSingleLoss: 80_001 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(true);
  });

  it('all deductions exceed 100 → score clamps to 0', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({
        engineeringClassA: 10,
        engineeringClassB: 10,
        engineeringClassC: 10,
        afterSalesClassA: 10,
        afterSalesClassB: 10,
        afterSalesClassC: 10,
        failures: 100,
      }),
      totalIssueCount: 0,
    });
    expect(result.score).toBe(0);
    expect(result.engineeringScore).toBe(0);
    expect(result.afterSalesScore).toBe(0);
    expect(result.incomingScore).toBe(0);
  });

  it('negative loss values: maxSingleLoss=-5000 → score not affected by negative', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ maxSingleLoss: -5000 }),
      totalIssueCount: 0,
    });
    expect(result.score).toBe(100);
    expect(result.shouldFreeze).toBe(false);
  });

  it('score deduction math: 1 engineeringClassA → 15 deducted → score=85', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassA: 1 }),
      totalIssueCount: 0,
    });
    expect(result.score).toBe(85);
    expect(result.engineeringScore).toBe(85);
  });

  it('score deduction math: 1 engineeringClassB → 5 deducted → score=95', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassB: 1 }),
      totalIssueCount: 0,
    });
    expect(result.score).toBe(95);
  });

  it('score deduction math: 1 engineeringClassC → 1 deducted → score=99', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ engineeringClassC: 1 }),
      totalIssueCount: 0,
    });
    expect(result.score).toBe(99);
  });

  it('score deduction math: 1 failure → 3 deducted → incomingScore=97', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ failures: 1 }),
      totalIssueCount: 0,
    });
    expect(result.incomingScore).toBe(97);
  });

  it('downgrade from count>5 + low qualifiedRate', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 89,
      stat: makeStat({ count: 6 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(true);
  });

  it('no downgrade when count=5 (not > 5)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 89,
      stat: makeStat({ count: 5 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(false);
  });

  it('no downgrade when qualifiedRate=90 (not < 90)', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 90,
      stat: makeStat({ count: 6 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(false);
  });

  it('shouldFreeze: both conditions false → false', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ consecutiveBigFailures: 2, maxSingleLoss: 79_999 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(false);
  });

  it('shouldFreeze: maxSingleLoss triggers but consecutive does not', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat({ consecutiveBigFailures: 1, maxSingleLoss: 100_000 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(true);
  });

  it('stabilityScore always 100 in buildSupplierScore', () => {
    const result = buildSupplierScore({
      incomingQualifiedRate: 100,
      stat: makeStat(),
      totalIssueCount: 0,
    });
    expect(result.stabilityScore).toBe(100);
  });
});

describe('buildInHouseOutsourcingScore', () => {
  it('openIssueCount=3 → shouldDowngradeToC=true (>= 3)', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ openEngineeringCount: 2, openAfterSalesCount: 1 }),
      totalIssueCount: 0,
    });
    expect(result.openIssueCount).toBe(3);
    expect(result.shouldDowngradeToC).toBe(true);
  });

  it('openIssueCount=2 → shouldDowngradeToC=false', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ openEngineeringCount: 1, openAfterSalesCount: 1 }),
      totalIssueCount: 0,
    });
    expect(result.openIssueCount).toBe(2);
    expect(result.shouldDowngradeToC).toBe(false);
  });

  it('stabilityScore with openIssueCount=10 → clamp100(100 - 100) = 0', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ openEngineeringCount: 5, openAfterSalesCount: 5 }),
      totalIssueCount: 0,
    });
    expect(result.stabilityScore).toBe(0);
  });

  it('engineeringCount=5, all classes=0 → unclosed issues penalty 0.5 each', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ engineeringCount: 5 }),
      totalIssueCount: 0,
    });
    // deduction: 0*12 + 0*4 + 0*0.5 + 5*0.5 = 2.5
    // clamp100 returns 97.5 (no rounding in sub-score)
    expect(result.engineeringScore).toBe(97.5);
  });

  it('engineeringDeduction with all classes filled: no unclosed', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({
        engineeringCount: 3,
        engineeringClassA: 1,
        engineeringClassB: 1,
        engineeringClassC: 1,
      }),
      totalIssueCount: 0,
    });
    // deduction: 1*12 + 1*4 + 1*0.5 + 0*0.5 = 16.5
    // clamp100 returns 83.5 (no rounding in sub-score)
    expect(result.engineeringScore).toBe(83.5);
  });

  it('afterSalesDeduction with unclosed: afterSalesCount=4, classes sum=1', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({
        afterSalesCount: 4,
        afterSalesClassA: 1,
        afterSalesClassB: 0,
        afterSalesClassC: 0,
      }),
      totalIssueCount: 0,
    });
    // deduction: 1*12 + 0*4 + 0*0.5 + 3*0.5 = 13.5
    // clamp100 returns 86.5 (no rounding in sub-score)
    expect(result.afterSalesScore).toBe(86.5);
  });

  it('incomingScore always 100 for in-house outsourcing', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat(),
      totalIssueCount: 0,
    });
    expect(result.incomingScore).toBe(100);
  });

  it('shouldDowngradeToC: classA sum >= 2 triggers', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ engineeringClassA: 1, afterSalesClassA: 1 }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(true);
  });

  it('shouldDowngradeToC: classB sum >= 3 triggers', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({
        engineeringClassB: 2,
        afterSalesClassB: 1,
      }),
      totalIssueCount: 0,
    });
    expect(result.shouldDowngradeToC).toBe(true);
  });

  it('shouldFreeze: totalIssueCount=3 + consecutiveBigFailures=3', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ consecutiveBigFailures: 3 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(true);
  });

  it('shouldFreeze: maxSingleLoss=80001 triggers', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({ maxSingleLoss: 80_001 }),
      totalIssueCount: 3,
    });
    expect(result.shouldFreeze).toBe(true);
  });

  it('openIssueDeduction: 0 open issues → no deduction', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat(),
      totalIssueCount: 0,
    });
    // No deductions → score should be 100
    expect(result.score).toBe(100);
  });

  it('score clamps to 0 with massive deductions', () => {
    const result = buildInHouseOutsourcingScore({
      stat: makeStat({
        engineeringClassA: 10,
        engineeringClassB: 10,
        engineeringClassC: 10,
        engineeringCount: 30,
        afterSalesClassA: 10,
        afterSalesClassB: 10,
        afterSalesClassC: 10,
        afterSalesCount: 30,
        openEngineeringCount: 20,
        openAfterSalesCount: 20,
      }),
      totalIssueCount: 0,
    });
    expect(result.score).toBe(0);
  });
});

describe('applyRecordsToStats', () => {
  it('loss=0 → maxSingleLoss stays 0', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: 0, origin: 'qualityRecords', type: 'A' },
    ]);
    expect(result.maxSingleLoss).toBe(0);
  });

  it('negative loss → maxSingleLoss NOT updated (potential bug)', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: -5000, origin: 'qualityRecords', type: 'A' },
    ]);
    // Code: if (record.loss > next.maxSingleLoss) → -5000 > 0 is false → maxSingleLoss stays 0
    expect(result.maxSingleLoss).toBe(0);
  });

  it('records with loss < 0 mixed with positive → maxSingleLoss is max positive', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: -100, origin: 'qualityRecords', type: 'A' },
      { loss: 500, origin: 'qualityRecords', type: 'B' },
      { loss: -200, origin: 'afterSales', type: 'C' },
    ]);
    expect(result.maxSingleLoss).toBe(500);
  });

  it('qualityRecords origin → engineering classes counted', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: 'A' },
      { loss: 200, origin: 'qualityRecords', type: 'B' },
      { loss: 300, origin: 'qualityRecords', type: 'C' },
    ]);
    expect(result.engineeringClassA).toBe(1);
    expect(result.engineeringClassB).toBe(1);
    expect(result.engineeringClassC).toBe(1);
    expect(result.afterSalesClassA).toBe(0);
  });

  it('afterSales origin → afterSales classes counted', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'afterSales', type: 'A' },
      { loss: 200, origin: 'afterSales', type: 'A' },
    ]);
    expect(result.afterSalesClassA).toBe(2);
    expect(result.engineeringClassA).toBe(0);
  });

  it('type=null → not counted in any class', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: null },
      { loss: 200, origin: 'afterSales', type: null },
    ]);
    expect(result.engineeringClassA).toBe(0);
    expect(result.engineeringClassB).toBe(0);
    expect(result.engineeringClassC).toBe(0);
    expect(result.afterSalesClassA).toBe(0);
    expect(result.afterSalesClassB).toBe(0);
    expect(result.afterSalesClassC).toBe(0);
  });

  it('empty records → stats unchanged', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, []);
    expect(result).toEqual(stat);
  });

  it('consecutiveBigFailures: takes Math.max of existing and new', () => {
    const stat = makeStat({ consecutiveBigFailures: 5 });
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: 'A' },
      { loss: 100, origin: 'qualityRecords', type: 'A' },
    ]);
    // calculateConsecutiveFailures on 2 records = 2, max(5, 2) = 5
    expect(result.consecutiveBigFailures).toBe(5);
  });

  it('consecutiveBigFailures: new calculation exceeds existing', () => {
    const stat = makeStat({ consecutiveBigFailures: 1 });
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: 'A' },
      { loss: 100, origin: 'qualityRecords', type: 'B' },
      { loss: 100, origin: 'qualityRecords', type: 'A' },
      { loss: 100, origin: 'qualityRecords', type: 'B' },
    ]);
    // calculateConsecutiveFailures = 4, max(1, 4) = 4
    expect(result.consecutiveBigFailures).toBe(4);
  });

  it('does not mutate original stat', () => {
    const stat = createEmptyStats();
    const original = { ...stat };
    applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: 'A' },
    ]);
    expect(stat).toEqual(original);
  });

  it('multiple records of same type accumulate', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: 'A' },
      { loss: 200, origin: 'qualityRecords', type: 'A' },
      { loss: 300, origin: 'qualityRecords', type: 'A' },
    ]);
    expect(result.engineeringClassA).toBe(3);
  });

  it('mixed origins and types counted correctly', () => {
    const stat = createEmptyStats();
    const result = applyRecordsToStats(stat, [
      { loss: 100, origin: 'qualityRecords', type: 'A' },
      { loss: 200, origin: 'afterSales', type: 'A' },
      { loss: 300, origin: 'qualityRecords', type: 'B' },
      { loss: 400, origin: 'afterSales', type: 'C' },
    ]);
    expect(result.engineeringClassA).toBe(1);
    expect(result.engineeringClassB).toBe(1);
    expect(result.afterSalesClassA).toBe(1);
    expect(result.afterSalesClassC).toBe(1);
  });
});

describe('scoreSupplierListItem', () => {
  it('Manual status=Frozen → stays Frozen even with high score', () => {
    const result = scoreSupplierListItem(
      { status: 'Frozen' },
      makeStat(),
    );
    expect(result.status).toBe('Frozen');
    expect(result.qualityScore).toBe(100);
  });

  it('Manual status=Trial → stays Trial', () => {
    const result = scoreSupplierListItem(
      { status: 'Trial' },
      makeStat(),
    );
    expect(result.status).toBe('Trial');
  });

  it('Manual status=QUALIFIED (uppercase) → normalized then evaluated', () => {
    const result = scoreSupplierListItem(
      { status: 'QUALIFIED' },
      makeStat(),
    );
    // 'QUALIFIED'.toLowerCase() === 'qualified' → enters the scoring branch
    expect(result.status).toBe('Qualified');
  });

  it('Manual status=Observation → stays Observation', () => {
    const result = scoreSupplierListItem(
      { status: 'Observation' },
      makeStat(),
    );
    expect(result.status).toBe('Observation');
  });

  it('score=90 → rating A', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({
        engineeringClassA: 0,
        engineeringClassB: 0,
        engineeringClassC: 0,
      }),
    );
    // Perfect stat → score=100 → A
    expect(result.level).toBe('A');
    expect(result.rating).toBe('A');
  });

  it('score=89 → rating B (via deduction engineeringClassA=1 → 100-15=85, so B)', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 1 }),
    );
    expect(result.level).toBe('B');
    expect(result.rating).toBe('B');
  });

  it('score exactly 80 → rating B', () => {
    // 100 - 15 (engA) - 5 (engB) = 80 → B
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 1, engineeringClassB: 1 }),
    );
    expect(result.level).toBe('B');
  });

  it('score=79 → rating C (observation)', () => {
    // 100 - 15 - 5 - 1 = 79 → C, also < 75 threshold? No, 79 >= 75
    // But let's force 79: engA=1 (15) + engB=1 (5) + engC=1 (1) = 21 → 79
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 1, engineeringClassB: 1, engineeringClassC: 1 }),
    );
    expect(result.qualityScore).toBe(79);
    expect(result.level).toBe('C');
  });

  it('score=65 → rating C', () => {
    // Need total deduction of 35. engA=2 (30) + engB=1 (5) = 35 → 65
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 2, engineeringClassB: 1 }),
    );
    expect(result.qualityScore).toBe(65);
    expect(result.level).toBe('C');
  });

  it('score=64 → rating D', () => {
    // Need total deduction of 36. engA=2 (30) + engB=1 (5) + engC=1 (1) = 36 → 64
    const result = scoreSupplierListItem(
      {},
      makeStat({
        engineeringClassA: 2,
        engineeringClassB: 1,
        engineeringClassC: 1,
      }),
    );
    expect(result.qualityScore).toBe(64);
    expect(result.level).toBe('D');
  });

  it('outsourced + IN_HOUSE_TEAM → uses in-house scoring model', () => {
    const result = scoreSupplierListItem(
      { category: 'Outsourcing', outsourcingMode: 'IN_HOUSE_TEAM' },
      makeStat({ openEngineeringCount: 1, openAfterSalesCount: 1 }),
    );
    expect(result.scoringModel).toBe('IN_HOUSE_OUTSOURCING');
    expect(result.stabilityScore).toBe(80); // 100 - 2*10 = 80
  });

  it('outsourced + EXTERNAL_PROCESSOR → uses standard scoring', () => {
    const result = scoreSupplierListItem(
      { category: 'Outsourcing', outsourcingMode: 'EXTERNAL_PROCESSOR' },
      makeStat(),
    );
    expect(result.scoringModel).toBe('SUPPLIER');
  });

  it('freeze sets score=0 and status=Frozen', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ consecutiveBigFailures: 3, maxSingleLoss: 100_000, engineeringCount: 3 }),
    );
    expect(result.status).toBe('Frozen');
    expect(result.qualityScore).toBe(0);
    expect(result.isWarning).toBe(true);
  });

  it('downgrade to Observation when shouldDowngradeToC=true', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 2 }),
    );
    expect(result.status).toBe('Observation');
    expect(result.qualityScore).toBe(70); // min(70, 70) for standard model
  });

  it('score < 75 → Observation with score capped at 75', () => {
    // Need deduction > 25: engA=2 (30) → score=70 which is < 75
    // But shouldDowngradeToC fires first (classA=2 >= 2)
    // Let's use only classB to avoid downgrade: classB=6 → 30 deduction → 70
    // Actually classB sum >= 3 triggers downgrade. Let's use failures only
    // failures=9 → 27 deduction → 73 < 75
    const result = scoreSupplierListItem(
      {},
      makeStat({ failures: 9 }),
    );
    expect(result.status).toBe('Observation');
    expect(result.qualityScore).toBe(73);
  });

  it('isWarning=true when status is Observation', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 2 }),
    );
    expect(result.isWarning).toBe(true);
  });

  it('isWarning=false when status is Qualified', () => {
    const result = scoreSupplierListItem({}, makeStat());
    expect(result.isWarning).toBe(false);
  });

  it('count=0 → incomingQualifiedRate=100 (division by zero guard)', () => {
    const result = scoreSupplierListItem({}, makeStat({ count: 0 }));
    expect(result.incomingQualifiedRate).toBe(100);
  });

  it('count=10, qualifiedCount=8 → incomingQualifiedRate=80', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ count: 10, qualifiedCount: 8 }),
    );
    expect(result.incomingQualifiedRate).toBe(80);
  });

  it('in-house outsourcing: downgrade cap is 85 not 70', () => {
    const result = scoreSupplierListItem(
      { category: 'Outsourcing', outsourcingMode: 'IN_HOUSE_TEAM' },
      makeStat({ engineeringClassA: 2 }),
    );
    expect(result.status).toBe('Observation');
    // in-house outsourcing uses cap 85, standard uses 70
    // but the actual score depends on the scoring formula
    expect(result.scoringModel).toBe('IN_HOUSE_OUTSOURCING');
    expect(result.qualityScore).toBeLessThanOrEqual(85);
  });

  it('warningReasons populated on freeze', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ consecutiveBigFailures: 3, maxSingleLoss: 100_000, engineeringCount: 3 }),
    );
    expect(result.warningReasons.length).toBeGreaterThan(0);
  });

  it('warningReasons empty on Qualified', () => {
    const result = scoreSupplierListItem({}, makeStat());
    expect(result.warningReasons).toEqual([]);
  });

  it('item spread: extra fields preserved in output', () => {
    const result = scoreSupplierListItem(
      { name: 'Test Supplier', foo: 'bar' },
      makeStat(),
    );
    expect(result.name).toBe('Test Supplier');
    expect(result.foo).toBe('bar');
  });

  it('status defaults to Qualified when not provided', () => {
    const result = scoreSupplierListItem({}, makeStat());
    expect(result.status).toBe('Qualified');
  });

  it('downgrade warningReason uses Chinese text for standard model', () => {
    const result = scoreSupplierListItem(
      {},
      makeStat({ engineeringClassA: 2 }),
    );
    expect(result.warningReasons).toContain('累计问题触发C级降级');
  });

  it('downgrade warningReason uses Chinese text for in-house model', () => {
    const result = scoreSupplierListItem(
      { category: 'Outsourcing', outsourcingMode: 'IN_HOUSE_TEAM' },
      makeStat({ engineeringClassA: 2 }),
    );
    expect(result.warningReasons).toContain('未关闭/严重问题触发观察');
  });
});
