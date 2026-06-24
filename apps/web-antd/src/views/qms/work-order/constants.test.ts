import { describe, expect, it } from 'vitest';

import {
  CHART_COLORS,
  getStableColor,
  getWorkOrderStatusUI,
  WORK_ORDER_STATUS_UI_MAP,
} from './constants';

describe('getWorkOrderStatusUI', () => {
  it('returns OPEN config when status is undefined', () => {
    expect(getWorkOrderStatusUI(undefined)).toEqual(
      WORK_ORDER_STATUS_UI_MAP.OPEN,
    );
  });

  it('returns OPEN config when status is empty string', () => {
    expect(getWorkOrderStatusUI('')).toEqual(WORK_ORDER_STATUS_UI_MAP.OPEN);
  });

  it('returns correct config for known status', () => {
    expect(getWorkOrderStatusUI('COMPLETED')).toEqual(
      WORK_ORDER_STATUS_UI_MAP.COMPLETED,
    );
  });

  it('normalizes lowercase status to uppercase', () => {
    expect(getWorkOrderStatusUI('in_progress')).toEqual(
      WORK_ORDER_STATUS_UI_MAP.IN_PROGRESS,
    );
  });

  it('returns fallback config for unknown status', () => {
    const result = getWorkOrderStatusUI('UNKNOWN_STATUS');
    expect(result).toEqual({
      color: 'default',
      textKey: 'qms.workOrder.status.unknown',
      defaultText: '未知状态',
      icon: 'lucide:help-circle',
    });
  });
});

describe('getStableColor', () => {
  it('returns a valid hex color', () => {
    const color = getStableColor('test');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('returns same color for same input', () => {
    expect(getStableColor('北京事业部')).toBe(getStableColor('北京事业部'));
  });

  it('returns different colors for different inputs', () => {
    const c1 = getStableColor('alpha');
    const c2 = getStableColor('bravo');
    expect(c1).not.toBe(c2);
  });

  it('always returns a color from CHART_COLORS', () => {
    for (const name of ['a', 'bb', 'ccc', 'dddd', 'eeeee']) {
      expect(CHART_COLORS).toContain(getStableColor(name));
    }
  });
});
