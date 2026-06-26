import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { WxSubscribeMessageService } from '~/modules/user';
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
import { notifyTelegramNewRequest } from '~/utils/telegram-bot';

import {
  generateInspectionRequestNo,
  isIncomingInspectionRequestProcess,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
  serializeInspectionStationSelection,
} from './inspection-request';
import { publishInspectionRequestCreated } from './inspection-request-events';
import {
  assertWorkOrdersExist,
  inspectionRequestWorkOrdersInclude,
  normalizeInspectionRequestWorkOrderNumbers,
} from './inspection-request-work-orders';

type RequestBody = Record<string, unknown>;

export const InspectionRequestCreateService = {
  async createRequest(
    event: H3Event,
    userinfo: null | UserSession,
    body: RequestBody,
    isPublic = false,
  ) {
    const payload = await buildCreateRequestPayload(body);
    await assertWorkOrdersExist(prisma, payload.workOrderNumbers);

    const created = await prisma.$transaction(async (tx) => {
      const request = await tx.qms_inspection_requests.create({
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
          stationSelection: payload.stationSelection,
          reporter: payload.reporter,
          requestInfo: normalizeInspectionRequestText(body.requestInfo) || null,
          requestNo: await generateInspectionRequestNo(tx),
          selfCheckResult: normalizeInspectionRequestCheckResult(
            body.selfCheckResult,
          ),
          ...payload.governedFields,
          ...payload.governedCanonicalIds,
          workOrderNumber: payload.workOrderNumber,
          workOrders: {
            create: payload.workOrderNumbers.map((workOrderNumber, index) => ({
              isPrimary: index === 0,
              workOrderNumber,
            })),
          },
        },
        include: {
          dispatcher: { select: { realName: true, username: true } },
          inspector: { select: { realName: true, username: true } },
          process: { select: { name: true } },
          workOrders: inspectionRequestWorkOrdersInclude,
        },
      });
      return request;
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
    void WxSubscribeMessageService.sendPendingDispatchCreated({
      partName: mapped.partName,
      reporter: mapped.reporter,
      requestNo: mapped.requestNo,
      workOrderNumber: mapped.workOrderNumber,
    });
    void notifyTelegramNewRequest(mapped);
    return mapped;
  },
};

async function buildCreateRequestPayload(body: RequestBody) {
  const workOrderNumbers = normalizeInspectionRequestWorkOrderNumbers(body);
  const workOrderNumber =
    normalizeInspectionRequestText(body.workOrderNumber) ||
    workOrderNumbers[0] ||
    '';
  const partName = normalizeInspectionRequestText(body.partName);
  const processName = normalizeInspectionRequestText(body.processName);
  const skipsComponentName =
    isInspectionRequestAssemblyProcess(processName) ||
    isIncomingInspectionRequestProcess(processName);
  const componentName = skipsComponentName
    ? ''
    : normalizeInspectionRequestText(body.componentName);
  const reporter = normalizeInspectionRequestText(body.reporter);
  const team = normalizeInspectionRequestText(body.team);
  const quantity = parseInspectionRequestQuantity(body.quantity);
  const stationSelection = serializeInspectionStationSelection(
    body.stationSelection,
    quantity,
  );
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
    stationSelection,
    teamId: await resolveTeamIdForWrite({ team }),
    workOrderNumber,
    workOrderNumbers,
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
