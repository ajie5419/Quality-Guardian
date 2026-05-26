import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { InspectionApiService } from '~/modules/inspection/inspection-api.service';
import {
  isInspectionRequestAssemblyProcess,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
} from '~/modules/inspection/inspection-request';
import { logApiError } from '~/utils/api-logger';
import { getCurrentUser } from '~/utils/current-user';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

const schema = z.object({}).passthrough();

export default defineEventHandler(async (event) => {
  const userinfo = getCurrentUser(event);
  const body = schema.parse(await readBody(event));

  const workOrderNumber = normalizeInspectionRequestText(body.workOrderNumber);
  const partName = normalizeInspectionRequestText(body.partName);
  const processName = normalizeInspectionRequestText(body.processName);
  const componentName = isInspectionRequestAssemblyProcess(processName)
    ? ''
    : normalizeInspectionRequestText(body.componentName);
  const reporter = normalizeInspectionRequestText(body.reporter);
  const team = normalizeInspectionRequestText(body.team);
  parseInspectionRequestQuantity(body.quantity);
  const attachments = normalizeInspectionRequestAttachments(body.attachments);
  if (
    !workOrderNumber ||
    !partName ||
    !processName ||
    (!isInspectionRequestAssemblyProcess(processName) && !componentName) ||
    !team ||
    !reporter ||
    attachments.length === 0
  ) {
    return badRequestResponse(
      event,
      '工单号、工序、一级部件名称、组件名称、班组、报检人、自检记录不能为空',
    );
  }

  try {
    const created = await InspectionApiService.createRequest(
      event,
      userinfo,
      body,
    );
    return useResponseSuccess(created);
  } catch (error) {
    logApiError('inspection-request-create', error, undefined, event);
    if (error instanceof Error && error.message.startsWith('BAD_REQUEST:'))
      return badRequestResponse(
        event,
        error.message.replace('BAD_REQUEST:', ''),
      );
    return internalServerErrorResponse(event, '创建报检任务失败');
  }
});
