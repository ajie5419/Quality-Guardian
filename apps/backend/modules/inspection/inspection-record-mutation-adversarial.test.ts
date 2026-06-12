import { describe, expect, it } from 'vitest';
import { InspectionRecordRules } from '~/modules/inspection/inspection-record-types';

describe('inspectionRecordRules adversarial', () => {
  describe('resolveOverallResult', () => {
    it('items with FAIL → overall FAIL regardless of manual result', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [
          { checkItem: 'A', result: 'FAIL' },
          { checkItem: 'B', result: 'PASS' },
        ],
        quantity: 10,
        result: 'PASS',
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('FAIL');
    });

    it('items with CONDITIONAL → CONDITIONAL when no FAIL', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [
          { checkItem: 'A', result: 'CONDITIONAL' },
          { checkItem: 'B', result: 'PASS' },
        ],
        quantity: 10,
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('CONDITIONAL');
    });

    it('all PASS items → PASS', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [
          { checkItem: 'A', result: 'PASS' },
          { checkItem: 'B', result: 'PASS' },
        ],
        quantity: 10,
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('PASS');
    });

    it('no items → PASS', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [],
        quantity: 10,
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('PASS');
    });

    it('manual result=FAIL overrides computed PASS', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [{ checkItem: 'A', result: 'PASS' }],
        quantity: 10,
        result: 'FAIL',
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('FAIL');
    });

    it('manual result="fail" (lowercase) → FAIL', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [],
        quantity: 10,
        result: 'fail',
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('FAIL');
    });

    it('manual result="PASS" does NOT override computed FAIL', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [{ checkItem: 'A', result: 'FAIL' }],
        quantity: 10,
        result: 'PASS',
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('FAIL');
    });

    it('manual result="" → computed result used', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [{ checkItem: 'A', result: 'FAIL' }],
        quantity: 10,
        result: '',
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('FAIL');
    });

    it('manual result=undefined → computed result used', () => {
      const result = InspectionRecordRules.resolveOverallResult({
        category: 'PROCESS',
        inspectionDate: '2026-01-01',
        inspector: 'Tester',
        items: [{ checkItem: 'A', result: 'CONDITIONAL' }],
        quantity: 10,
        workOrderNumber: 'WO-1',
      });
      expect(result).toBe('CONDITIONAL');
    });
  });

  describe('normalizeQuantitySummary', () => {
    it('both qualified + unqualified provided and sum=total → used directly', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        qualifiedQuantity: 7,
        quantity: 10,
        result: 'PASS',
        unqualifiedQuantity: 3,
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
      });
    });

    it('both provided but sum != total → falls through to unqualified path', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        qualifiedQuantity: 5,
        quantity: 10,
        result: 'PASS',
        unqualifiedQuantity: 3,
      });
      expect(summary.quantity).toBe(10);
      expect(summary.unqualifiedQuantity).toBe(3);
      expect(summary.qualifiedQuantity).toBe(7);
    });

    it('only unqualified provided → derived qualified', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        result: 'PASS',
        unqualifiedQuantity: 3,
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
      });
    });

    it('only qualified provided → derived unqualified', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        qualifiedQuantity: 6,
        result: 'PASS',
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 6,
        unqualifiedQuantity: 4,
      });
    });

    it('neither provided, result=FAIL → all unqualified', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        result: 'FAIL',
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 0,
        unqualifiedQuantity: 10,
      });
    });

    it('neither provided, result=PASS → all qualified', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        result: 'PASS',
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 10,
        unqualifiedQuantity: 0,
      });
    });

    it('quantity=0 → normalized to 1', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 0,
        result: 'PASS',
      });
      expect(summary.quantity).toBe(1);
      expect(summary.qualifiedQuantity).toBe(1);
      expect(summary.unqualifiedQuantity).toBe(0);
    });

    it('quantity=negative → normalized to 1', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: -5,
        result: 'PASS',
      });
      expect(summary.quantity).toBe(1);
    });

    it('quantity=NaN → normalized to 1', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: Number.NaN,
        result: 'PASS',
      });
      expect(summary.quantity).toBe(1);
    });

    it('unqualifiedQuantity > totalQuantity → clamped to total', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 5,
        result: 'FAIL',
        unqualifiedQuantity: 999,
      });
      expect(summary.unqualifiedQuantity).toBe(5);
      expect(summary.qualifiedQuantity).toBe(0);
    });

    it('qualifiedQuantity > totalQuantity → clamped to total', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 5,
        qualifiedQuantity: 999,
        result: 'PASS',
      });
      expect(summary.qualifiedQuantity).toBe(5);
      expect(summary.unqualifiedQuantity).toBe(0);
    });

    it('unqualifiedQuantity negative → clamped to 0', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        result: 'PASS',
        unqualifiedQuantity: -3,
      });
      expect(summary.unqualifiedQuantity).toBe(0);
      expect(summary.qualifiedQuantity).toBe(10);
    });

    it('qualifiedQuantity negative → clamped to 0', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        qualifiedQuantity: -3,
        result: 'PASS',
      });
      expect(summary.qualifiedQuantity).toBe(0);
      expect(summary.unqualifiedQuantity).toBe(10);
    });

    it('qualifiedQuantity=NaN, unqualified=3 → uses unqualified path', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        qualifiedQuantity: Number.NaN,
        result: 'PASS',
        unqualifiedQuantity: 3,
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
      });
    });

    it('unqualifiedQuantity=NaN, qualified=7 → uses qualified path', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        qualifiedQuantity: 7,
        result: 'PASS',
        unqualifiedQuantity: Number.NaN,
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 7,
        unqualifiedQuantity: 3,
      });
    });

    it('both NaN → falls to result-based default', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        qualifiedQuantity: Number.NaN,
        result: 'PASS',
        unqualifiedQuantity: Number.NaN,
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 10,
        unqualifiedQuantity: 0,
      });
    });

    it('decimal quantity not truncated (Math.max preserves decimals)', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10.7,
        result: 'PASS',
      });
      expect(summary.quantity).toBe(10.7);
      expect(summary.qualifiedQuantity).toBe(10.7);
      expect(summary.unqualifiedQuantity).toBe(0);
    });

    it('result=undefined → treated as non-FAIL', () => {
      const summary = InspectionRecordRules.normalizeQuantitySummary({
        quantity: 10,
        result: undefined,
      });
      expect(summary).toEqual({
        quantity: 10,
        qualifiedQuantity: 10,
        unqualifiedQuantity: 0,
      });
    });
  });

  describe('assertResultQuantityConsistency', () => {
    it('pASS with unqualifiedQuantity=0 → passes', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('PASS', {
          quantity: 10,
          qualifiedQuantity: 10,
          unqualifiedQuantity: 0,
        }),
      ).not.toThrow();
    });

    it('pASS with unqualifiedQuantity>0 → throws', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('PASS', {
          quantity: 10,
          qualifiedQuantity: 7,
          unqualifiedQuantity: 3,
        }),
      ).toThrow('检验结论为合格时，不合格数量必须为 0');
    });

    it('fAIL with unqualifiedQuantity=0 → throws', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('FAIL', {
          quantity: 10,
          qualifiedQuantity: 10,
          unqualifiedQuantity: 0,
        }),
      ).toThrow('检验结论为不合格时，不合格数量必须大于 0');
    });

    it('fAIL with unqualifiedQuantity>0 → passes', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('FAIL', {
          quantity: 10,
          qualifiedQuantity: 7,
          unqualifiedQuantity: 3,
        }),
      ).not.toThrow();
    });

    it('cONDITIONAL with any quantity → passes (no assertion)', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('CONDITIONAL', {
          quantity: 10,
          qualifiedQuantity: 7,
          unqualifiedQuantity: 3,
        }),
      ).not.toThrow();
    });

    it('nA with any quantity → passes', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('NA', {
          quantity: 10,
          qualifiedQuantity: 10,
          unqualifiedQuantity: 0,
        }),
      ).not.toThrow();
    });

    it('fAIL with unqualifiedQuantity=1 → passes', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('FAIL', {
          quantity: 10,
          qualifiedQuantity: 9,
          unqualifiedQuantity: 1,
        }),
      ).not.toThrow();
    });

    it('pASS with unqualifiedQuantity=0.5 → throws (0.5 > 0)', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('PASS', {
          quantity: 10,
          qualifiedQuantity: 9.5,
          unqualifiedQuantity: 0.5,
        }),
      ).toThrow('检验结论为合格时，不合格数量必须为 0');
    });

    it('fAIL with unqualifiedQuantity=NaN → throws (NaN <= 0)', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('FAIL', {
          quantity: 10,
          qualifiedQuantity: 10,
          unqualifiedQuantity: Number.NaN,
        }),
      ).toThrow('检验结论为不合格时，不合格数量必须大于 0');
    });

    it('pASS with unqualifiedQuantity=NaN → passes (code uses || 0 fallback)', () => {
      expect(() =>
        InspectionRecordRules.assertResultQuantityConsistency('PASS', {
          quantity: 10,
          qualifiedQuantity: 10,
          unqualifiedQuantity: Number.NaN,
        }),
      ).not.toThrow();
    });
  });

  describe('determineItemResult', () => {
    it('item with result=NA → NA', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
        result: 'NA',
      });
      expect(result).toBe('NA');
    });

    it('item with standard and measured within tolerance → PASS', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
        measuredValue: '10.5',
        result: 'PASS',
        standardValue: '10',
        upperTolerance: '1',
        lowerTolerance: '1',
      });
      expect(result).toBe('PASS');
    });

    it('item with measured above upper tolerance → FAIL', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
        measuredValue: '12',
        result: 'PASS',
        standardValue: '10',
        upperTolerance: '1',
        lowerTolerance: '1',
      });
      expect(result).toBe('FAIL');
    });

    it('item with measured below lower tolerance → FAIL', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
        measuredValue: '8',
        result: 'PASS',
        standardValue: '10',
        upperTolerance: '1',
        lowerTolerance: '1',
      });
      expect(result).toBe('FAIL');
    });

    it('item with no result → defaults to PASS', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
      });
      expect(result).toBe('PASS');
    });

    it('item with empty result string → PASS', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
        result: '',
      });
      expect(result).toBe('PASS');
    });

    it('item with invalid result → PASS (default)', () => {
      const result = InspectionRecordRules.determineItemResult({
        checkItem: 'A',
        result: 'INVALID',
      });
      expect(result).toBe('PASS');
    });
  });

  describe('calculateOverallResult', () => {
    it('empty items → PASS', () => {
      expect(InspectionRecordRules.calculateOverallResult([])).toBe('PASS');
    });

    it('one FAIL among many → FAIL', () => {
      const result = InspectionRecordRules.calculateOverallResult([
        { checkItem: 'A', result: 'PASS' },
        { checkItem: 'B', result: 'FAIL' },
        { checkItem: 'C', result: 'PASS' },
      ]);
      expect(result).toBe('FAIL');
    });

    it('cONDITIONAL without FAIL → CONDITIONAL', () => {
      const result = InspectionRecordRules.calculateOverallResult([
        { checkItem: 'A', result: 'PASS' },
        { checkItem: 'B', result: 'CONDITIONAL' },
      ]);
      expect(result).toBe('CONDITIONAL');
    });

    it('fAIL + CONDITIONAL → FAIL', () => {
      const result = InspectionRecordRules.calculateOverallResult([
        { checkItem: 'A', result: 'CONDITIONAL' },
        { checkItem: 'B', result: 'FAIL' },
      ]);
      expect(result).toBe('FAIL');
    });

    it('all CONDITIONAL → CONDITIONAL', () => {
      const result = InspectionRecordRules.calculateOverallResult([
        { checkItem: 'A', result: 'CONDITIONAL' },
        { checkItem: 'B', result: 'CONDITIONAL' },
      ]);
      expect(result).toBe('CONDITIONAL');
    });
  });
});
