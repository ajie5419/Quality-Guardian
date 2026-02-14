import { describe, expect, it } from 'vitest';

import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from './import-summary';

describe('import summary utils', () => {
  it('resolves error count using explicit backend errorCount first', () => {
    const result = resolveImportErrorCount(
      {
        errorCount: 2,
        successCount: 3,
        totalCount: 10,
      },
      8,
    );

    expect(result).toEqual({
      errorCount: 2,
      totalCount: 10,
    });
  });

  it('falls back to derived error count when backend errorCount is missing', () => {
    const result = resolveImportErrorCount(
      {
        successCount: 3,
      },
      5,
    );

    expect(result).toEqual({
      errorCount: 2,
      totalCount: 5,
    });
  });

  it('builds warning message with row-level preview', () => {
    const text = buildImportWarningMessage(
      {
        successCount: 1,
        errors: [
          { row: 2, reason: '工单号为空' },
          { row: 5, reason: '项目名称无效' },
        ],
      },
      2,
    );

    expect(text).toContain('失败 2 条');
    expect(text).toContain('第2行: 工单号为空');
    expect(text).toContain('第5行: 项目名称无效');
  });

  it('builds fallback warning message when no row details exist', () => {
    const text = buildImportWarningMessage(
      {
        successCount: 1,
      },
      3,
    );

    expect(text).toBe('导入完成，失败 3 条，请检查数据后重试');
  });
});
