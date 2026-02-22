export interface QmsListResponse<T> {
  items: T[];
  total: number;
}

export interface QmsMutationResponse<T = unknown> {
  data?: T;
  message?: string;
  success: boolean;
}

export interface NormalizedApiError {
  code?: string;
  message: string;
  status?: number;
}

export interface QmsImportSummary {
  errorCount?: number;
  errors?: Array<{
    reason?: string;
    row?: number;
  }>;
  failedCount?: number;
  failedItems?: {
    error: string;
    item: Record<string, any>;
    row: number;
  }[];
  successCount: number;
  totalCount?: number;
}
