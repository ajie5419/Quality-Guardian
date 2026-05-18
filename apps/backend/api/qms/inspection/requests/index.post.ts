import { defineEventHandler, readBody } from 'h3';
import { FileStorageService } from '~/services/file-storage.service';
import { logApiError } from '~/utils/api-logger';
import { recordBusinessAuditLog } from '~/utils/audit-log';
import {
  generateInspectionRequestNo,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from '~/utils/inspection-request';
import { publishInspectionRequestCreated } from '~/utils/inspection-request-events';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

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
  const componentName = isInspectionRequestAssemblyProcess(processName)
    ? ''
    : normalizeInspectionRequestText(body.componentName);
  const reporter = normalizeInspectionRequestText(body.reporter);
  const team = normalizeInspectionRequestText(body.team);
  const quantity = parseInspectionRequestQuantity(body.quantity);
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
    const workOrder = await prisma.work_orders.findUnique({
      select: { workOrderNumber: true },
      where: { workOrderNumber },
    });
    if (!workOrder) {
      return badRequestResponse(event, '工单不存在');
    }

    const created = await prisma.qms_inspection_requests.create({
      data: {
        mutualCheckResult: normalizeInspectionRequestCheckResult(
          body.mutualCheckResult,
        ),
        attachments:
          attachments.length > 0 ? JSON.stringify(attachments) : null,
        componentName: componentName || null,
        partName,
        processName,
        quantity,
        reporter,
        requestInfo: normalizeInspectionRequestText(body.requestInfo) || null,
        requestNo: await generateInspectionRequestNo(prisma),
        selfCheckResult: normalizeInspectionRequestCheckResult(
          body.selfCheckResult,
        ),
        team: team || null,
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

    await recordBusinessAuditLog(event, {
      action: 'CREATE',
      details: `新增报检任务: ${created.requestNo} (${created.workOrderNumber}/${created.processName}/${created.partName})`,
      targetId: String(created.id),
      targetType: 'inspection_request',
      userId: userinfo?.id,
    });

    const mapped = mapInspectionRequest(created);
    publishInspectionRequestCreated(mapped);

    return useResponseSuccess(mapped);
  } catch (error) {
    logApiError('inspection-request-create', error);
    return internalServerErrorResponse(event, '创建报检任务失败');
  }
});
