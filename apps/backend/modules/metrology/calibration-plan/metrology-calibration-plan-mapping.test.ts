import { describe, expect, it } from 'vitest';
import {
  buildCalibrationPlanOrderBy,
  buildCalibrationStatusWhere,
  buildListItem,
  buildOverviewWhere,
  buildPlannedDate,
  buildWhere,
  compareValues,
  deriveStatus,
  formatDate,
  getValidatedPlanParts,
  mapImportRow,
  normalizeKey,
  normalizeMutationPayload,
  parseDateValue,
  parsePositiveInteger,
  parseStructuredDateText,
  pickRowValue,
} from '~/modules/metrology/calibration-plan/metrology-calibration-plan-mapping';

describe('metrology calibration plan mapping helpers', () => {
  it('builds order clauses for default, scalar, and instrument fields', () => {
    expect(buildCalibrationPlanOrderBy()).toEqual([
      { plannedDate: 'asc' },
      { createdAt: 'desc' },
    ]);
    expect(buildCalibrationPlanOrderBy('planYear', 'desc')).toEqual([
      { planYear: 'desc' },
      { createdAt: 'desc' },
    ]);
    expect(buildCalibrationPlanOrderBy('instrumentCode', 'desc')).toEqual([
      { instrument: { instrumentCode: 'desc' } },
      { createdAt: 'desc' },
    ]);
  });

  it('normalizes import keys and picks row values by fuzzy header names', () => {
    const row = { ' 设备 名称 ': 'Gauge', month1: 15 };

    expect(normalizeKey(' 设备 名称 ')).toBe('设备名称');
    expect(pickRowValue(row, ['设备名称'])).toBe('Gauge');
    expect(pickRowValue(row, ['1月', 'month1'])).toBe(15);
  });

  it('parses and formats dates with validation', () => {
    expect(buildPlannedDate(2026, 2, 31)).toBeNull();
    const plannedDate = buildPlannedDate(2026, 2, 28);
    expect(plannedDate?.getFullYear()).toBe(2026);
    expect(plannedDate?.getMonth()).toBe(1);
    expect(plannedDate?.getDate()).toBe(28);
    expect(formatDate('invalid')).toBeNull();
    expect(formatDate(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
    const structuredDate = parseStructuredDateText('2026年1月2日');
    expect(structuredDate?.getFullYear()).toBe(2026);
    expect(structuredDate?.getMonth()).toBe(0);
    expect(structuredDate?.getDate()).toBe(2);
    expect(parseDateValue('bad')).toEqual({
      date: null,
      error: '实际完成日期格式无效',
    });
  });

  it('parses positive integers and validates mutation payload parts', () => {
    expect(parsePositiveInteger('', '计划年份')).toEqual({
      value: null,
      error: '计划年份不能为空',
    });
    expect(parsePositiveInteger('1.5', '计划年份')).toEqual({
      value: null,
      error: '计划年份必须是整数',
    });
    expect(parsePositiveInteger('13', '计划月份', { max: 12, min: 1 })).toEqual(
      {
        value: null,
        error: '计划月份超出范围',
      },
    );
    expect(parsePositiveInteger('6', '计划月份', { max: 12, min: 1 })).toEqual({
      value: 6,
      error: null,
    });

    const normalized = normalizeMutationPayload({
      actualDate: '2026-06-16',
      instrumentId: ' m-1 ',
      planDay: '15',
      planMonth: '6',
      planYear: '2026',
      remark: ' remark ',
    });

    expect(getValidatedPlanParts(normalized)).toEqual({
      planDay: 15,
      planMonth: 6,
      planYear: 2026,
    });
    expect(normalized.instrumentId).toBe('m-1');
    expect(normalized.remark).toBe('remark');
    expect(() =>
      getValidatedPlanParts(
        normalizeMutationPayload({
          instrumentId: 'm-1',
          planDay: '',
          planMonth: '6',
          planYear: '2026',
        }),
      ),
    ).toThrow('计划日期无效');
  });

  it('derives statuses and maps list items', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const past = new Date();
    past.setFullYear(past.getFullYear() - 1);

    expect(deriveStatus(new Date(), future)).toBe('COMPLETED');
    expect(deriveStatus(null, past)).toBe('OVERDUE');
    expect(deriveStatus(null, future)).toBe('PLANNED');

    expect(
      buildListItem({
        actualDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'plan-1',
        instrument: {
          id: 'm-1',
          instrumentCode: 'M-001',
          instrumentName: 'Gauge',
          model: 'G-1',
          orderNo: 1,
          usingUnit: 'QA',
        },
        planDay: future.getDate(),
        planMonth: future.getMonth() + 1,
        plannedDate: future,
        planYear: future.getFullYear(),
        remark: null,
        sourceFileName: null,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'plan-1',
        instrumentCode: 'M-001',
        status: 'PLANNED',
        statusLabel: '已计划',
      }),
    );
  });

  it('builds where clauses for keyword, using unit, status, and overview', () => {
    expect(
      buildWhere({
        keyword: 'Gauge',
        status: 'COMPLETED',
        usingUnit: 'QA',
        year: 2026,
      }),
    ).toEqual(
      expect.objectContaining({
        AND: [{ actualDate: { not: null } }],
        instrument: expect.objectContaining({
          OR: expect.any(Array),
          isDeleted: false,
          usingUnit: { contains: 'QA' },
        }),
        isDeleted: false,
        planYear: 2026,
      }),
    );
    expect(buildCalibrationStatusWhere('OVERDUE')).toEqual(
      expect.objectContaining({
        actualDate: null,
        plannedDate: expect.objectContaining({ lt: expect.any(Date) }),
      }),
    );
    expect(buildCalibrationStatusWhere('unknown')).toBeNull();
    expect(buildOverviewWhere({ month: 6, year: 2026 })).toEqual({
      instrument: { isDeleted: false },
      isDeleted: false,
      planYear: 2026,
    });
  });

  it('compares values with direction and maps import rows', () => {
    expect(compareValues(2, 10, 'asc')).toBeLessThan(0);
    expect(compareValues('A2', 'A10', 'asc')).toBeLessThan(0);
    expect(compareValues('A2', 'A10', 'desc')).toBeGreaterThan(0);

    expect(
      mapImportRow({
        编号: 'M-001',
        设备名称: 'Gauge',
        '1月': '15',
        month2: '20',
      }),
    ).toEqual({
      error: null,
      instrumentCode: 'M-001',
      instrumentName: 'Gauge',
      months: [
        { month: 1, planDay: 15 },
        { month: 2, planDay: 20 },
      ],
    });
    expect(mapImportRow({ 编号: '编号', 设备名称: '设备名称' })).toBeNull();
    expect(
      mapImportRow({ 编号: 'M-001', 设备名称: 'Gauge', '1月': 'bad' }),
    ).toEqual({
      error: '1月计划日期无效',
      instrumentCode: 'M-001',
      instrumentName: 'Gauge',
      months: [],
    });
  });
});
