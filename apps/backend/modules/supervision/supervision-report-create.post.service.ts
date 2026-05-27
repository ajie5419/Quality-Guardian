import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SupervisionService } from '~/modules/supervision/supervision.service';
import { logApiError } from '~/utils/api-logger';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const createReportBodySchema = z
  .object({
    attachments: z.array(z.any()).optional(),
    projectId: z.unknown().optional(),
    reporter: z.unknown().optional(),
  })
  .passthrough();

export default defineEventHandler(async (event) => {
  try {
    const body = createReportBodySchema.parse(await readBody(event));
    if (!String(body.projectId || '').trim()) {
      return badRequestResponse(event, '监造项目不能为空');
    }
    if (!String(body.reporter || '').trim()) {
      return badRequestResponse(event, '监造人员不能为空');
    }
    const data = await SupervisionService.createReport(body);
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        bizId: String(data.id),
        bizType: 'supervision_daily_report',
        fieldName: 'attachments',
      });
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) throw error;
    }
    return useResponseSuccess(data);
  } catch (error) {
    logApiError('supervision-reports-create', error, undefined, event);
    return internalServerErrorResponse(
      event,
      'Failed to create supervision report',
    );
  }
});
