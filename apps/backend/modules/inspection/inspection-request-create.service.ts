import type { Prisma } from '@prisma/client';
import type { H3Event } from 'h3';
import type { UserSession } from '~/utils/jwt-utils';

import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { WxSubscribeMessageService } from '~/modules/user';
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
  mapInspectionRequest,
  normalizeInspectionRequestCheckResult,
  normalizeInspectionRequestText,
} from './inspection-request';
import { buildCreateRequestPayload } from './inspection-request-create-payload';
import { resolveV2RequestResponsibility } from './inspection-request-create-responsibility.service';
import { retryInspectionRequestCreate } from './inspection-request-create-retry.service';
import { publishInspectionRequestCreated } from './inspection-request-events';
import {
  assertWorkOrdersExist,
  inspectionRequestWorkOrdersInclude,
  normalizeInspectionRequestWorkOrderNumbers,
} from './inspection-request-work-orders';

type RequestBody = Record<string, unknown>;
type InspectionRequestCreatePayload = Awaited<
  ReturnType<typeof buildCreateRequestPayload>
>;
type InspectionRequestRow = Awaited<
  ReturnType<Prisma.TransactionClient['qms_inspection_requests']['create']>
>;
const logger = createModuleLogger('inspection-request-create');

export const InspectionRequestCreateService = {
  /**
   * Read-only payload preparation for the create request. Runs OUTSIDE the
   * idempotency claim transaction so validation / master-data failures never
   * occupy the Idempotency-Key.
   */
  async prepareCreateRequest(
    body: RequestBody,
    identityContract: 'V1' | 'V2',
    isPublic: boolean,
  ) {
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
      machineStationBound > 1 &&
        selectedWorkOrder?.multiStationEnabled === true,
    );
    return { payload };
  },

  /**
   * The business create, runnable inside a caller-provided transaction (the
   * idempotency claim transaction). requestNo generation stays inside the
   * same transaction so a retry regenerates the sequence number.
   */
  async createRequestInTransaction(options: {
    body: RequestBody;
    identityContract: 'V1' | 'V2';
    payload: InspectionRequestCreatePayload;
    tx: Prisma.TransactionClient;
    userinfo: null | UserSession;
  }): Promise<InspectionRequestRow> {
    const { body, identityContract, payload, tx, userinfo } = options;
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
    return tx.qms_inspection_requests.create({
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
        supplierId: persistedResponsibility?.supplierId ?? payload.supplierId,
        supplierName:
          persistedResponsibility?.responsibility.supplierName ??
          (payload.supplierId ? payload.team : null),
        teamId: persistedResponsibility?.teamId ?? payload.teamId,
        ...(persistedResponsibility
          ? {
              responsibilityType:
                persistedResponsibility.responsibility.responsibilityType,
              responsibleDepartment:
                persistedResponsibility.responsibility.responsibleDepartment,
              responsibleDepartmentId:
                persistedResponsibility.responsibility.responsibleDepartmentId,
            }
          : {}),
        processName: payload.processName,
        quantity: payload.quantity,
        stationSelection: payload.stationSelection,
        reporter: payload.reporter,
        reporterId: userinfo?.id ? String(userinfo.id) : null,
        requestInfo: normalizeInspectionRequestText(body.requestInfo) || null,
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
        materialRequest: {
          select: { requestedName: true, status: true },
        },
        workOrders: inspectionRequestWorkOrdersInclude,
      },
    });
  },

  /**
   * Post-commit side effects of a successful create. Only runs once per
   * business entity: the idempotency handlers call it only when the request
   * was NOT replayed, so a network retry never re-triggers file references,
   * audit, SSE/Redis publish, WxSubscribe or Telegram.
   */
  async applyCreateRequestPostCommitEffects(options: {
    body: RequestBody;
    created: InspectionRequestRow;
    event: H3Event;
    isPublic: boolean;
    payload: InspectionRequestCreatePayload;
    userinfo: null | UserSession;
  }) {
    const { created, event, isPublic, payload, userinfo } = options;
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
    const { payload } =
      await InspectionRequestCreateService.prepareCreateRequest(
        body,
        identityContract,
        isPublic,
      );
    const created = await retryInspectionRequestCreate(() =>
      prisma.$transaction((tx) =>
        InspectionRequestCreateService.createRequestInTransaction({
          body,
          identityContract,
          payload,
          tx,
          userinfo,
        }),
      ),
    );
    return InspectionRequestCreateService.applyCreateRequestPostCommitEffects({
      body,
      created,
      event,
      isPublic,
      payload,
      userinfo,
    });
  },
};

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
