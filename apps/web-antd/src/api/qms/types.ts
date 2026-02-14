export interface QmsImportRowError {
  field?: string;
  key?: string;
  reason: string;
  row: number;
  suggestion?: string;
}

export interface QmsImportSummary {
  errorCount?: number;
  errors?: QmsImportRowError[];
  successCount: number;
  totalCount?: number;
}
