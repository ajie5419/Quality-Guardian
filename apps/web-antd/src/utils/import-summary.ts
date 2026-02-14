import type { QmsImportSummary } from '#/api/qms/types';

const DEFAULT_MAX_ERROR_PREVIEW = 3;

export function resolveImportErrorCount(
  result: QmsImportSummary,
  fallbackTotalCount: number,
) {
  const totalCount = result.totalCount ?? fallbackTotalCount;
  const errorCount =
    result.errorCount ?? Math.max(0, totalCount - result.successCount);

  return {
    errorCount,
    totalCount,
  };
}

export function buildImportWarningMessage(
  result: QmsImportSummary,
  errorCount: number,
  maxPreview = DEFAULT_MAX_ERROR_PREVIEW,
) {
  const previewText =
    result.errors
      ?.slice(0, maxPreview)
      .map((error) => `第${error.row}行: ${error.reason}`)
      .join('；') || '';

  return previewText
    ? `导入完成，失败 ${errorCount} 条。${previewText}`
    : `导入完成，失败 ${errorCount} 条，请检查数据后重试`;
}
