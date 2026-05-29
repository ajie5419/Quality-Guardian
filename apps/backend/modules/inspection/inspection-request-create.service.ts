import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { UserService } from '~/modules/user';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import prisma from '~/utils/prisma';
import {
  resolveCanonicalProcessName,
  resolveProcessIdForWrite,
} from '~/utils/process-resolver';
import { resolveTeamIdForWrite } from '~/utils/team-resolver';
import { notifyWechatWork } from '~/utils/wechat-work-notify';

import {
  generateInspectionRequestNo,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from './inspection-request';
import { publishInspectionRequestCreated } from './inspection-request-events';

type RequestBody = Record<string, unknown>;

export const InspectionRequestCreateService = {
  async createRequest(
    event: H3Event,
    userinfo: null | UserSession,
    body: RequestBody,
    isPublic = false,
  ) {
    const payload = await buildCreateRequestPayload(body);
    await assertWorkOrderExists(payload.workOrderNumber);

    const created = await prisma.qms_inspection_requests.create({
      data: {
        attachments:
          payload.attachments.length > 0
            ? JSON.stringify(payload.attachments)
            : null,
        componentName: payload.componentName || null,
        mutualCheckResult: normalizeInspectionRequestCheckResult(
          body.mutualCheckResult,
        ),
        partName: payload.partName,
        processId: payload.processId,
        teamId: payload.teamId,
        processName: payload.processName,
        quantity: payload.quantity,
        reporter: payload.reporter,
        requestInfo: normalizeInspectionRequestText(body.requestInfo) || null,
        requestNo: await generateInspectionRequestNo(prisma),
        selfCheckResult: normalizeInspectionRequestCheckResult(
          body.selfCheckResult,
        ),
        ...payload.governedFields,
        ...payload.governedCanonicalIds,
        workOrderNumber: payload.workOrderNumber,
      },
      include: {
        dispatcher: { select: { realName: true, username: true } },
        inspector: { select: { realName: true, username: true } },
        process: { select: { name: true } },
      },
    });

    await FileStorageService.registerReferencesFromAttachments({
      attachments: payload.attachments,
      bizId: created.id,
      bizType: 'inspection_request',
    });

    const mapped = mapInspectionRequest(created);
    if (!isPublic && userinfo) {
      await auditRequestCreate(event, userinfo, created);
    }
    publishInspectionRequestCreated(mapped);
    void notifyDispatchers(mapped);
    return mapped;
  },
};

async function notifyDispatchers(request: {
  id: string;
  partName: string;
  processName: string;
  requestNo: string;
  workOrderNumber: string;
}) {
  const recipients = await UserService.findWechatWorkDispatchRecipients();
  const url = `https://www.tlqms.com/mobile/dispatch/${request.id}`;
  await Promise.all(
    recipients.map((user) =>
      user.wechatWorkId
        ? notifyWechatWork(
            user.wechatWorkId,
            'New inspection request',
            `${request.requestNo} ${request.workOrderNumber} ${request.processName} ${request.partName}`,
            url,
          )
        : Promise.resolve(),
    ),
  );
}

async function assertWorkOrderExists(workOrderNumber: string) {
  const workOrder = await prisma.work_orders.findUnique({
    select: { workOrderNumber: true },
    where: { workOrderNumber },
  });
  if (!workOrder) throw new Error('BAD_REQUEST:工单不存在');
}

async function buildCreateRequestPayload(body: RequestBody) {
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
  const governedFields = buildGovernedWriteFieldsForTable(
    'qms_inspection_requests',
    { componentName: componentName || null, team },
  );

  return {
    attachments,
    componentName,
    governedCanonicalIds: await buildGovernedCanonicalWritePairForTable(
      'qms_inspection_requests',
      governedFields,
    ),
    governedFields,
    partName,
    processId: await resolveProcessIdForWrite({ processName }),
    processName,
    quantity,
    reporter,
    teamId: await resolveTeamIdForWrite({ team }),
    workOrderNumber,
  };
}

async function auditRequestCreate(
  event: H3Event,
  userinfo: UserSession,
  created: {
    id: string;
    partName: string;
    process?: null | { name?: null | string };
    processName: string;
    requestNo: string;
    workOrderNumber: string;
  },
) {
  await recordBusinessAuditLog(event, {
    action: 'CREATE',
    detailsTemplate:
      '新增报检任务: {{requestNo}} ({{workOrderNumber}}/{{processName}}/{{partName}})',
    detailsVariables: {
      partName: created.partName,
      processName: resolveCanonicalProcessName(created) || '',
      requestNo: created.requestNo,
      workOrderNumber: created.workOrderNumber,
    },
    targetId: String(created.id),
    targetType: 'inspection_request',
    userId: userinfo.id,
  });
}
