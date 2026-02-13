import { defineEventHandler, getQuery, setResponseStatus } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { parseInspectionRecordListQuery } from '~/utils/inspection-record';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const { items, total } = await InspectionService.findAll(
      parseInspectionRecordListQuery(query),
    );
    return useResponseSuccess({ items, total });
  } catch (error: unknown) {
    logApiError('inspection-list', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch inspection records');
  }
});
