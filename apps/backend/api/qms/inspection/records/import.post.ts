import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

const DEFAULT_INSPECTION_CATEGORY = 'PROCESS';
const INSPECTION_CATEGORIES = new Set(['INCOMING', 'PROCESS', 'SHIPMENT']);

function normalizeInspectionCategory(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  return INSPECTION_CATEGORIES.has(normalized)
    ? normalized
    : DEFAULT_INSPECTION_CATEGORY;
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event);
    const { items, category } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return badRequestResponse(event, '未发现可导入的数据');
    }

    const normalizedCategory = normalizeInspectionCategory(category);
    let successCount = 0;
    for (const item of items) {
      try {
        await InspectionService.create({
          ...item,
          category: normalizeInspectionCategory(
            item.category ?? normalizedCategory,
          ),
        });
        successCount++;
      } catch (error) {
        logApiError('records-import-item', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch (error: unknown) {
    logApiError('records-import', error);
    setResponseStatus(event, 500);
    return useResponseError('数据解析失败');
  }
});
