export interface ImportRowError {
  field?: string;
  key?: string;
  reason: string;
  row: number;
  suggestion?: string;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

export function toImportErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'Unknown error');
}

export function inferImportErrorField(message: string): string | undefined {
  const patterns = [
    /Argument `(\w+)` is missing/i,
    /Unknown arg `(\w+)`/i,
    /for field `(\w+)`/i,
    /Invalid value for argument `(\w+)`/i,
    /Unknown argument `(\w+)`/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return undefined;
}

export function buildImportRowError(params: {
  field?: string;
  item?: Record<string, unknown>;
  keyField?: string;
  reason: string;
  row: number;
  suggestion?: string;
}): ImportRowError {
  const keyField = params.keyField || '';
  const keyValue = keyField ? normalizeText(params.item?.[keyField]) : '';

  return {
    field: params.field,
    key: keyValue || undefined,
    reason: params.reason,
    row: params.row,
    suggestion: params.suggestion,
  };
}

export function buildImportSummary(params: {
  rowErrors: ImportRowError[];
  successCount: number;
  totalCount: number;
}) {
  return {
    errorCount: params.rowErrors.length,
    errors: params.rowErrors.slice(0, 50),
    successCount: params.successCount,
    totalCount: params.totalCount,
  };
}
