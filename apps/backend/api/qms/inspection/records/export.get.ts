import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { logApiError } from '~/utils/api-logger';
import { parseInspectionRecordListQuery } from '~/utils/inspection-record';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event) as Record<string, unknown>;
    const params = parseInspectionRecordListQuery(query);
    const result = await InspectionService.findAll({
      ...params,
      forExport: true,
    });
    return useResponseSuccess(result);
  } catch (error: unknown) {
    logApiError('inspection-records-export', error);
    return internalServerErrorResponse(
      event,
      'Failed to export inspection records',
    );
  }
});
