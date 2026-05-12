import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import {
  generateInspectionRequestNo,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from '~/utils/inspection-request';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown>;
  const required = getMissingRequiredFields(body, [
    'workOrderNumber',
    'partName',
    'processName',
    'reporter',
  ]);
  if (required.length > 0) {
    return badRequestResponse(event, `缺少必填字段: ${required.join('/')}`);
  }

  const workOrderNumber = normalizeInspectionRequestText(body.workOrderNumber);
  const partName = normalizeInspectionRequestText(body.partName);
  const processName = normalizeInspectionRequestText(body.processName);
  const reporter = normalizeInspectionRequestText(body.reporter);
  const team = normalizeInspectionRequestText(body.team);
  const quantity = parseInspectionRequestQuantity(body.quantity);
  const attachments = normalizeInspectionRequestAttachments(body.attachments);
  if (
    !workOrderNumber ||
    !partName ||
    !processName ||
    !team ||
    !reporter ||
    attachments.length === 0
  ) {
    return badRequestResponse(
      event,
      '工单号、部件名称、工序、班组、报检人、报检单不能为空',
    );
  }

  try {
    const workOrder = await prisma.work_orders.findUnique({
      select: { workOrderNumber: true },
      where: { workOrderNumber },
    });
    if (!workOrder) {
      return badRequestResponse(event, '工单不存在');
    }

    const created = await prisma.qms_inspection_requests.create({
      data: {
        attachments: JSON.stringify(attachments),
        mutualCheckResult: normalizeInspectionRequestCheckResult(
          body.mutualCheckResult,
        ),
        partName,
        processName,
        quantity,
        reporter,
        requestInfo: normalizeInspectionRequestText(body.requestInfo) || null,
        requestNo: await generateInspectionRequestNo(prisma),
        selfCheckResult: normalizeInspectionRequestCheckResult(
          body.selfCheckResult,
        ),
        team,
        workOrderNumber,
      },
      include: {
        dispatcher: { select: { realName: true, username: true } },
        inspector: { select: { realName: true, username: true } },
      },
    });

    await FileStorageService.registerReferencesFromAttachments({
      attachments,
      bizId: created.id,
      bizType: 'inspection_request',
    });

    return useResponseSuccess(mapInspectionRequest(created));
  } catch (error) {
    logApiError('public-inspection-request-create', error);
    return internalServerErrorResponse(event, '创建报检任务失败');
  }
});
