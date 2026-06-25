import { defineEventHandler, getQuery } from 'h3';
import { z } from 'zod';
import { InspectionPublicQueryService } from '~/modules/inspection/inspection-public-query.service';
import { logApiError } from '~/utils/api-logger';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z
  .object({ workOrderNumber: z.string().optional() })
  .passthrough();

export default defineEventHandler(async (event) => {
  const query = schema.parse(getQuery(event));
  const workOrderNumber = String(query.workOrderNumber || '').trim();
  if (!workOrderNumber) return badRequestResponse(event, '工单号不能为空');

  try {
    return useResponseSuccess(
      await InspectionPublicQueryService.getPublicProcesses(workOrderNumber),
    );
  } catch (error) {
    logApiError('inspection-request-process-list', error, undefined, event);
    return internalServerErrorResponse(event, '获取工单工序失败');
  }
});
