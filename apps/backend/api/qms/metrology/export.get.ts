import { METROLOGY_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, getQuery } from 'h3';
import { MetrologyService } from '~/modules/metrology/metrology.service';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, METROLOGY_PERMISSION_CODES.EXPORT);
  try {
    const query = getQuery(event);
    const result = await MetrologyService.getExportList({
      inspectionStatus:
        String(query.inspectionStatus || '').trim() || undefined,
      instrumentCode: String(query.instrumentCode || '').trim() || undefined,
      instrumentName: String(query.instrumentName || '').trim() || undefined,
      keyword: String(query.keyword || '').trim() || undefined,
      model: String(query.model || '').trim() || undefined,
      usingUnit: String(query.usingUnit || '').trim() || undefined,
      validFrom: String(query.validFrom || '').trim() || undefined,
      validTo: String(query.validTo || '').trim() || undefined,
    });
    return useResponseSuccess(result);
  } catch (error) {
    logApiError('metrology-export', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to export metrology list',
    );
  }
});
