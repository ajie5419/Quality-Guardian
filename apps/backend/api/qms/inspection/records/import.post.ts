import { defineEventHandler, readBody } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/utils/import-report';
import { parseNonEmptyArray } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const DEFAULT_INSPECTION_CATEGORY = 'PROCESS';
const INSPECTION_CATEGORIES = new Set(['INCOMING', 'PROCESS', 'SHIPMENT']);
type InspectionCategory = 'INCOMING' | 'PROCESS' | 'SHIPMENT';

function normalizeInspectionCategory(value: unknown): InspectionCategory {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return INSPECTION_CATEGORIES.has(normalized)
    ? (normalized as InspectionCategory)
    : DEFAULT_INSPECTION_CATEGORY;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const items = parseNonEmptyArray<Record<string, unknown>>(body.items);
    const { category } = body;

    if (!items) {
      return badRequestResponse(event, '未发现可导入的数据');
    }

    const normalizedCategory = normalizeInspectionCategory(category);
    let successCount = 0;
    const rowErrors = [];
    for (const [index, item] of items.entries()) {
      try {
        const payload = {
          ...item,
          category: normalizeInspectionCategory(
            item.category ?? normalizedCategory,
          ),
        } as Parameters<typeof InspectionService.create>[0];
        await InspectionService.create(payload);
        successCount++;
      } catch (error) {
        logApiError('records-import-item', error);
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'serialNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }

    return useResponseSuccess(
      buildImportSummary({
        rowErrors,
        successCount,
        totalCount: items.length,
      }),
    );
  } catch (error: unknown) {
    logApiError('records-import', error);
    return internalServerErrorResponse(event, '数据解析失败');
  }
});
