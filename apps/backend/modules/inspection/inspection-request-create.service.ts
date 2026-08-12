import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { PartMasterService } from '~/modules/part-master';
import { ProcessMasterService } from '~/modules/process-master';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { SystemService } from '~/modules/system';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { WxSubscribeMessageService } from '~/modules/user';
import { BusinessError } from '~/utils/business-error';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';
import { notifyTelegramNewRequest } from '~/utils/telegram-bot';

import {
  generateInspectionRequestNo,
  isIncomingInspectionRequestProcess,
  isInspectionRequestAssemblyProcess,
  mapInspectionRequest,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
  normalizeInspectionStationSelection,
  parseInspectionRequestQuantity,
  serializeInspectionStationSelection,
} from './inspection-request';
import { resolveV2RequestResponsibility } from './inspection-request-create-responsibility.service';
import { retryInspectionRequestCreate } from './inspection-request-create-retry.service';
import { publishInspectionRequestCreated } from './inspection-request-events';
import { resolveInspectionRequestIssueResponsibilities } from './inspection-request-responsibility.service';
import {
  assertWorkOrdersExist,
  inspectionRequestWorkOrdersInclude,
  normalizeInspectionRequestWorkOrderNumbers,
} from './inspection-request-work-orders';

type RequestBody = Record<string, unknown>;
const logger = createModuleLogger('inspection-request-create');

export const InspectionRequestCreateService = {
  async createRequest(
    event: H3Event,
    userinfo: null | UserSession,
    body: RequestBody,
    isPublic = false,
    identityContract: 'V1' | 'V2' = 'V1',
  ) {
    if (identityContract === 'V1') {
      logger.warn(
        { isPublic },
        'legacy inspection request identity contract used',
      );
    }
    const workOrderNumbers = normalizeInspectionRequestWorkOrderNumbers(body);
    const workOrders =
      (await assertWorkOrdersExist(prisma, workOrderNumbers)) ?? [];
    const workOrderNumber =
      normalizeInspectionRequestText(body.workOrderNumber) ||
      workOrderNumbers[0] ||
      '';
    const selectedWorkOrder = workOrders.find(
      (item) => item.workOrderNumber === workOrderNumber,
    );
    const machineStationBound = Number(selectedWorkOrder?.quantity) || 0;
    const payload = await buildCreateRequestPayload(
      body,
      identityContract,
      isPublic,
      machineStationBound,
    );

    const created = await retryInspectionRequestCreate(() =>
      prisma.$transaction(async (tx) => {
        const persistedResponsibility =
          identityContract === 'V2'
            ? await resolveV2RequestResponsibility(payload, tx)
            : null;
        const governedFields = persistedResponsibility
          ? buildGovernedWriteFieldsForTable('qms_inspection_requests', {
              componentName: payload.componentName || null,
              partName: payload.partName,
              processName: payload.processName,
              team: persistedResponsibility.team,
            })
          : payload.governedFields;
        const governedCanonicalIds = persistedResponsibility
          ? await buildGovernedCanonicalWritePairForTable(
              'qms_inspection_requests',
              {
                ...governedFields,
                partId: payload.partId,
                processId: payload.processId,
                ...(persistedResponsibility.teamId
                  ? { teamId: persistedResponsibility.teamId }
                  : {}),
              },
            )
          : payload.governedCanonicalIds;
        const request = await tx.qms_inspection_requests.create({
          data: {
            attachments:
              payload.attachments.length > 0
                ? JSON.stringify(payload.attachments)
                : null,
            componentName: payload.componentName || null,
            category: payload.category,
            mutualCheckResult: normalizeInspectionRequestCheckResult(
              body.mutualCheckResult,
            ),
            processId: payload.processId,
            supplierId:
              persistedResponsibility?.supplierId ?? payload.supplierId,
            supplierName:
              persistedResponsibility?.responsibility.supplierName ??
              (payload.supplierId ? payload.team : null),
            teamId: persistedResponsibility?.teamId ?? payload.teamId,
            ...(persistedResponsibility
              ? {
                  responsibilityType:
                    persistedResponsibility.responsibility.responsibilityType,
                  responsibleDepartment:
                    persistedResponsibility.responsibility
                      .responsibleDepartment,
                  responsibleDepartmentId:
                    persistedResponsibility.responsibility
                      .responsibleDepartmentId,
                }
              : {}),
            processName: payload.processName,
            quantity: payload.quantity,
            stationSelection: payload.stationSelection,
            reporter: payload.reporter,
            requestInfo:
              normalizeInspectionRequestText(body.requestInfo) || null,
            // requestNo is generated inside the retried scope so each attempt
            // gets a fresh sequence number, avoiding persistent P2002 conflicts.
            requestNo: await generateInspectionRequestNo(tx),
            selfCheckResult: normalizeInspectionRequestCheckResult(
              body.selfCheckResult,
            ),
            ...governedFields,
            ...governedCanonicalIds,
            partId: payload.partId,
            partName: payload.partName,
            ...(payload.requestedPartName
              ? {
                  materialRequest: {
                    create: { requestedName: payload.requestedPartName },
                  },
                }
              : {}),
            workOrderNumber: payload.workOrderNumber,
            workOrders: {
              create: payload.workOrderNumbers.map(
                (workOrderNumber, index) => ({
                  isPrimary: index === 0,
                  workOrderNumber,
                }),
              ),
            },
          },
          include: {
            dispatcher: { select: { realName: true, username: true } },
            inspector: { select: { realName: true, username: true } },
            process: { select: { name: true } },
            materialRequest: {
              select: { requestedName: true, status: true },
            },
            workOrders: inspectionRequestWorkOrdersInclude,
          },
        });
        return request;
      }),
    );

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
    if (!payload.requestedPartName) {
      void WxSubscribeMessageService.sendPendingDispatchCreated({
        partName: mapped.partName,
        reporter: mapped.reporter,
        requestNo: mapped.requestNo,
        workOrderNumber: mapped.workOrderNumber,
      });
      void notifyTelegramNewRequest(mapped);
    }
    return mapped;
  },
};

async function resolveV2ProcessIdentity(
  processId: string,
  category: 'INCOMING' | 'PROCESS',
) {
  const processIdentity =
    await ProcessMasterService.assertInspectionRequestOption(
      processId,
      category,
    );
  return processIdentity.name;
}

function normalizeV2Category(value: unknown): 'INCOMING' | 'PROCESS' {
  const category = normalizeInspectionRequestText(value).toUpperCase();
  if (category !== 'INCOMING' && category !== 'PROCESS') {
    throw new BusinessError(
      'INVALID_INSPECTION_CATEGORY',
      'category must be INCOMING or PROCESS',
    );
  }
  return category;
}

async function buildCreateRequestPayload(
  body: RequestBody,
  identityContract: 'V1' | 'V2',
  _isPublic: boolean,
  machineStationBound = 0,
) {
  const workOrderNumbers = normalizeInspectionRequestWorkOrderNumbers(body);
  const workOrderNumber =
    normalizeInspectionRequestText(body.workOrderNumber) ||
    workOrderNumbers[0] ||
    '';
  const partId = normalizeInspectionRequestText(body.partId);
  const requestedPartName = normalizeInspectionRequestText(
    body.requestedPartName,
  );
  const processId = normalizeInspectionRequestText(body.processId);
  const legacyPartName = normalizeInspectionRequestText(body.partName);
  const legacyProcessName = normalizeInspectionRequestText(body.processName);
  let category: 'INCOMING' | 'PROCESS';
  if (identityContract === 'V2') {
    category = normalizeV2Category(body.category);
  } else {
    category = isIncomingInspectionRequestProcess(legacyProcessName)
      ? 'INCOMING'
      : 'PROCESS';
  }
  if (
    identityContract === 'V2' &&
    ((category === 'PROCESS' && (!partId || requestedPartName)) ||
      (category === 'INCOMING' &&
        Boolean(partId) === Boolean(requestedPartName)))
  ) {
    throw new BusinessError(
      'INVALID_MATERIAL_IDENTITY',
      'Process requests require partId; incoming requests require exactly one of partId or requestedPartName',
      400,
    );
  }
  if (identityContract === 'V2' && category === 'INCOMING') {
    const freeInputEnabled =
      await SystemService.isIncomingMaterialFreeInputEnabled();
    if (
      (freeInputEnabled && (!requestedPartName || partId)) ||
      (!freeInputEnabled && (!partId || requestedPartName))
    ) {
      throw new BusinessError(
        'MATERIAL_INPUT_MODE_MISMATCH',
        freeInputEnabled
          ? 'Incoming inspection requests require requestedPartName while free material input is enabled'
          : 'Incoming inspection requests require partId while free material input is disabled',
        400,
      );
    }
  }
  const [selectedPartIdentity, processName] =
    identityContract === 'V2'
      ? await Promise.all([
          partId ? PartMasterService.assertActive(partId) : null,
          resolveV2ProcessIdentity(processId, category),
        ])
      : [null, legacyProcessName];
  const partIdentity =
    selectedPartIdentity ||
    (category === 'INCOMING' && requestedPartName
      ? await PartMasterService.findActiveByExactName(requestedPartName)
      : null);
  const partName =
    identityContract === 'V2'
      ? partIdentity?.name || requestedPartName
      : legacyPartName;
  const skipsComponentName =
    category === 'INCOMING' || isInspectionRequestAssemblyProcess(processName);
  const componentName = skipsComponentName
    ? ''
    : normalizeInspectionRequestText(body.componentName);
  if (identityContract === 'V2' && !skipsComponentName && !componentName) {
    throw new BusinessError(
      'COMPONENT_NAME_REQUIRED',
      'componentName is required for non-assembly process inspection requests',
    );
  }
  const reporter = normalizeInspectionRequestText(body.reporter);
  const isIncoming = category === 'INCOMING';
  const requiresLegacyIdentity = identityContract === 'V1';
  const supplier =
    requiresLegacyIdentity && isIncoming
      ? await SupplierIdentityService.resolveSupplierById(
          normalizeInspectionRequestText(body.supplierId),
        )
      : null;
  const teamIdentity =
    requiresLegacyIdentity && !isIncoming
      ? await SupplierIdentityService.resolveTeamById(
          normalizeInspectionRequestText(body.teamId),
        )
      : null;
  if (requiresLegacyIdentity && isIncoming && !supplier) {
    throw new BusinessError(
      'SUPPLIER_ID_REQUIRED',
      'supplierId is required for incoming inspection requests',
    );
  }
  if (requiresLegacyIdentity && !isIncoming && !teamIdentity) {
    throw new BusinessError(
      'TEAM_ID_REQUIRED',
      'teamId is required for process inspection requests',
    );
  }
  const team = supplier?.name || teamIdentity?.name || '';
  if (requiresLegacyIdentity) {
    const [responsibility] =
      await resolveInspectionRequestIssueResponsibilities([
        {
          category,
          processName,
          supplierId: supplier?.id,
          team,
          teamId: teamIdentity?.id,
        },
      ]);
    const hasExternalResponsibility =
      responsibility?.responsibilityType !== 'INTERNAL_DEPARTMENT';
    if (
      !responsibility?.responsibleDepartmentId ||
      (hasExternalResponsibility && !responsibility.supplierId) ||
      (isIncoming && responsibility?.responsibilityType !== 'SUPPLIER')
    ) {
      throw new BusinessError(
        'INSPECTION_REQUEST_RESPONSIBILITY_UNRESOLVED',
        'The selected inspection request identity has no complete canonical responsibility',
        409,
      );
    }
  }
  const quantity = parseInspectionRequestQuantity(body.quantity);
  const normalizedStationSelection = normalizeInspectionStationSelection(
    body.stationSelection,
  );
  if (normalizedStationSelection && machineStationBound < 1) {
    throw new BusinessError(
      'INVALID_STATION_SELECTION',
      'station selection requires a work order with at least one machine',
    );
  }
  const stationSelection = serializeInspectionStationSelection(
    body.stationSelection,
    machineStationBound > 0 ? machineStationBound : undefined,
  );
  const attachments = normalizeInspectionRequestAttachments(body.attachments);
  const governedFields = buildGovernedWriteFieldsForTable(
    'qms_inspection_requests',
    {
      componentName: componentName || null,
      partName,
      processName,
      team,
    },
  );
  const governedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
    'qms_inspection_requests',
    {
      ...governedFields,
      ...(identityContract === 'V2' ? { partId, processId } : {}),
      ...(isIncoming ? {} : { teamId: teamIdentity?.id }),
    },
  );
  if (
    identityContract === 'V2' &&
    (!governedCanonicalIds.processId ||
      (category === 'PROCESS' && !partIdentity))
  ) {
    throw new BusinessError(
      'INSPECTION_REQUEST_IDENTITY_REQUIRED',
      'Required identities must resolve to active canonical records',
    );
  }

  return {
    attachments,
    category,
    componentName,
    governedCanonicalIds,
    governedFields,
    partId:
      partIdentity?.id ||
      (requestedPartName ? null : governedCanonicalIds.partId || null),
    partName:
      partIdentity?.name ||
      (requestedPartName
        ? partName
        : governedCanonicalIds.partName || partName),
    processId: governedCanonicalIds.processId || null,
    processName: governedCanonicalIds.processName || processName,
    quantity,
    reporter,
    requestedPartName: partIdentity ? '' : requestedPartName,
    stationSelection,
    supplierId: supplier?.id || null,
    team,
    teamId: teamIdentity?.id || null,
    v2Responsibility: {
      responsibilityType: normalizeInspectionRequestText(
        body.responsibilityType,
      ),
      responsibleDepartmentId: normalizeInspectionRequestText(
        body.responsibleDepartmentId,
      ),
      supplierId: normalizeInspectionRequestText(body.supplierId),
      teamId: normalizeInspectionRequestText(body.teamId),
    },
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
