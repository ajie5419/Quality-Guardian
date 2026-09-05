import type {
  MetricStructuredObject,
  MetricStructuredValue,
} from './metric-governance.types';

import { BusinessError } from '~/utils/business-error';

const EXECUTABLE_KEY = /eval|expression|function|javascript|script|sql/i;
const EXECUTABLE_VALUE = /\beval\(|\bfunction\(|=>|\bselect\b|\bexecute\(/i;

export function assertMetricCode(metricCode: string): void {
  if (!/^BM-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(metricCode)) {
    throw new BusinessError(
      'BAD_REQUEST',
      '指标编码必须为稳定的 BM- 大写编码',
      400,
    );
  }
}

export function assertExpectedRevision(expectedRevision: number): void {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new BusinessError('BAD_REQUEST', '缺少有效的 expectedRevision', 400);
  }
}

export function assertNoExecutableMetadata(value: MetricStructuredValue): void {
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoExecutableMetadata(item));
    return;
  }
  if (typeof value === 'string') {
    if (EXECUTABLE_VALUE.test(value)) {
      throw new BusinessError(
        'BAD_REQUEST',
        '指标定义不允许包含可执行 SQL 或 JavaScript',
        400,
      );
    }
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as MetricStructuredObject).forEach(([key, nested]) => {
      if (EXECUTABLE_KEY.test(key)) {
        throw new BusinessError(
          'BAD_REQUEST',
          '指标定义不允许包含执行公式字段',
          400,
        );
      }
      assertNoExecutableMetadata(nested);
    });
  }
}
