import type { H3Event } from 'h3';
import type { AnalyticsAccessContext } from '~/modules/data-scope';
import type { ImportRowError } from '~/modules/file-storage/import-report';
import type { UserSession } from '~/utils/jwt-utils';

import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import {
  parseOptionalDate,
  parseRequiredDate,
  parseRequiredWorkOrderNumber,
  parseWorkOrderListQuery,
  parseWorkOrderQuantity,
} from '~/modules/work-order/work-order-query';
import { WorkOrderService } from '~/modules/work-order/work-order.service';
import { logApiError } from '~/utils/api-logger';
import {
  EXPORT_LIMIT_EXCEEDED_MESSAGE,
  isExportLimitExceeded,
} from '~/utils/export-constants';
import prisma from '~/utils/prisma';

import { buildWorkOrderImportGovernedFields } from './work-order-import-governance';
import { WorkOrderRequirementRouteService } from './work-order-requirement-route.service';
import { mapWorkOrderStatus } from './work-order-status';
import {
  buildScopedWorkOrderWhere,
  deleteWorkOrderVersioned,
  updateWorkOrderVersioned,
} from './work-order-versioned-write.service';
import {
  buildWorkOrderGovernedFields,
  buildWorkOrderUpdateData,
  createOrRestoreWorkOrder,
  resolveInteractiveStatus,
} from './work-order-write.service';

export const WorkOrderRouteService = {
  async batchDelete(event: H3Event, ids: string[], userinfo: UserSession) {
    const where = await buildScopedWorkOrderWhere(
      { workOrderNumber: { in: ids }, isDeleted: false },
      event,
      userinfo,
    );
    const result = await prisma.work_orders.updateMany({
      where,
      data: { isDeleted: true, updatedAt: new Date() },
    });
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'work_order',
      targetId: ids.join(','),
      detailsTemplate: '批量删除工单: {{count}} 条',
      detailsVariables: { count: result.count },
    });
    return { successCount: result.count };
  },
  async deleteById(
    event: H3Event,
    id: string,
    userinfo: UserSession,
    expectedVersion?: number,
  ) {
    await deleteWorkOrderVersioned(event, id, userinfo, expectedVersion);
    return null;
  },
  async create(
    event: H3Event,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const woNum = parseRequiredWorkOrderNumber(body.workOrderNumber);
    if (!woNum || !body.customerName)
      throw new Error('BAD_REQUEST:缺少必填字段');
    const governedFields = await buildWorkOrderGovernedFields({
      customerName: body.customerName,
      customerNameId: body.customerNameId,
      division: body.division,
      divisionId: body.divisionId,
    });
    const workOrderData = {
      customerName: body.customerName as string,
      projectName: body.projectName as string | undefined,
      ...governedFields,
      quantity: parseWorkOrderQuantity(body.quantity, 1),
      multiStationEnabled: body.multiStationEnabled === true,
      deliveryDate: parseRequiredDate(body.deliveryDate),
      effectiveTime: parseOptionalDate(body.effectiveTime),
      status: resolveInteractiveStatus(body.status),
      isDeleted: false,
      updatedAt: new Date(),
    };
    const newWO = await createOrRestoreWorkOrder(
      event,
      { data: workOrderData, workOrderNumber: woNum },
      userinfo.id,
    );
    return {
      ...newWO,
      id: newWO.workOrderNumber,
      createTime: newWO.createdAt
        .toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        .replaceAll('/', '-'),
    };
  },
  async update(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
    expectedVersion: number,
  ) {
    const updateData = await buildWorkOrderUpdateData(id, body);
    await updateWorkOrderVersioned(
      event,
      id,
      updateData,
      userinfo,
      expectedVersion,
    );
    return null;
  },
  async importRows(
    event: H3Event,
    items: Array<Record<string, unknown>>,
    userinfo: UserSession,
  ) {
    let successCount = 0;
    const rowErrors: ImportRowError[] = [];
    for (const [index, item] of items.entries()) {
      try {
        const woNumber = parseRequiredWorkOrderNumber(item.workOrderNumber);
        if (!woNumber) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'workOrderNumber',
              reason: '工单号为空',
              row: index + 1,
              suggestion: '请填写有效工单号',
            }),
          );
          continue;
        }
        const governedFields = await buildWorkOrderImportGovernedFields({
          customerName: item.customerName,
          customerNameId: item.customerNameId,
          division: item.division,
          divisionId: item.divisionId,
        });
        await prisma.work_orders.upsert({
          where: { workOrderNumber: woNumber },
          update: {
            customerName: item.customerName
              ? String(item.customerName)
              : undefined,
            projectName: item.projectName
              ? String(item.projectName)
              : undefined,
            ...governedFields,
            quantity:
              item.quantity !== undefined && item.quantity !== null
                ? parseWorkOrderQuantity(item.quantity, 1)
                : undefined,
            multiStationEnabled: item.multiStationEnabled === true,
            deliveryDate: parseRequiredDate(item.deliveryDate),
            effectiveTime: parseOptionalDate(item.effectiveTime),
            status: mapWorkOrderStatus(item.status),
            isDeleted: false,
          },
          create: {
            workOrderNumber: woNumber,
            customerName: String(item.customerName || '未知客户'),
            projectName: String(item.projectName || ''),
            ...governedFields,
            quantity: parseWorkOrderQuantity(item.quantity, 1),
            multiStationEnabled: item.multiStationEnabled === true,
            deliveryDate: parseRequiredDate(item.deliveryDate),
            effectiveTime: parseOptionalDate(item.effectiveTime),
            status: mapWorkOrderStatus(item.status),
          },
        });
        successCount++;
      } catch (error) {
        logApiError('import', error, undefined, event);
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'workOrderNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'work_order',
      targetId: 'batch-import',
      detailsTemplate: '导入工单: {{successCount}}/{{totalCount}} 条',
      detailsVariables: { successCount, totalCount: items.length },
    });
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
  async createRequirements(
    event: H3Event,
    requirements: Array<Record<string, unknown>>,
    userinfo: UserSession,
  ) {
    return WorkOrderRequirementRouteService.createRequirements(
      event,
      requirements,
      userinfo,
    );
  },
  async updateRequirement(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    return WorkOrderRequirementRouteService.updateRequirement(
      event,
      id,
      body,
      userinfo,
    );
  },
  async deleteRequirement(event: H3Event, id: string, userinfo: UserSession) {
    return WorkOrderRequirementRouteService.deleteRequirement(
      event,
      id,
      userinfo,
    );
  },
  async getRequirements(workOrderNumber: string) {
    return WorkOrderRequirementRouteService.getRequirements(workOrderNumber);
  },
  async exportList(
    event: H3Event,
    query: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const params = parseWorkOrderListQuery(query);
    const result = await WorkOrderService.getListForExport({
      ...params,
      dataScope: event.context.dataScope,
      userContext: {
        userId: String(userinfo.id || userinfo.userId || ''),
        username: userinfo.username,
      },
    });
    if (isExportLimitExceeded(result.items))
      throw new Error(`BAD_REQUEST:${EXPORT_LIMIT_EXCEEDED_MESSAGE}`);
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'EXPORT',
      targetType: 'work_order',
      targetId: 'export',
      detailsTemplate: '导出工单: {{count}} 条',
      detailsVariables: { count: result.total || 0 },
    });
    return { items: result.items || [], total: result.total || 0 };
  },
  async getRequirementBoard(
    query: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    return WorkOrderRequirementRouteService.getRequirementBoard(
      query,
      userinfo,
    );
  },
  async getWorkOrderAggregate(
    workOrderNumber: string,
    access?: AnalyticsAccessContext,
  ) {
    return WorkOrderRequirementRouteService.getWorkOrderAggregate(
      workOrderNumber,
      access,
    );
  },
};
