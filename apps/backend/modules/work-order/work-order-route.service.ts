import type { H3Event } from 'h3';
import type { ImportRowError } from '~/modules/file-storage/import-report';
import type { UserSession } from '~/utils/jwt-utils';

import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';
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
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import {
  isPrismaNotFoundError,
  isPrismaRequiredValueError,
  isPrismaUniqueConflictError,
} from '~/utils/prisma-error';

import { WorkOrderRequirementRouteService } from './work-order-requirement-route.service';
import { mapWorkOrderStatus } from './work-order-status';

export const WorkOrderRouteService = {
  async batchDelete(event: H3Event, ids: string[], userinfo: UserSession) {
    const result = await prisma.work_orders.updateMany({
      where: { workOrderNumber: { in: ids }, isDeleted: false },
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
  async deleteById(event: H3Event, id: string, userinfo: UserSession) {
    try {
      const deleted = await prisma.work_orders.update({
        where: { workOrderNumber: id },
        data: { isDeleted: true, updatedAt: new Date() },
      });
      await recordBusinessAuditLog(event, {
        userId: userinfo.id,
        action: 'DELETE',
        targetType: 'work_order',
        targetId: String(id),
        detailsTemplate: '删除工单: {{workOrderNumber}} ({{customerName}})',
        detailsVariables: {
          customerName: deleted.customerName,
          workOrderNumber: deleted.workOrderNumber,
        },
      });
      return null;
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        throw new BusinessError('NOT_FOUND', '工单不存在', 404);
      }
      throw error;
    }
  },
  async create(
    event: H3Event,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const woNum = parseRequiredWorkOrderNumber(body.workOrderNumber);
    if (!woNum || !body.customerName)
      throw new Error('BAD_REQUEST:缺少必填字段');
    const existing = await prisma.work_orders.findUnique({
      where: { workOrderNumber: woNum },
    });
    if (existing)
      throw new Error(`CONFLICT:工单号 ${woNum} 已存在，请使用其他编号`);
    const governedFields = buildGovernedWriteFieldsForTable('work_orders', {
      customerName: body.customerName,
      division: body.division,
    });
    try {
      const newWO = await prisma.work_orders.create({
        data: {
          workOrderNumber: woNum,
          customerName: body.customerName as string,
          projectName: body.projectName as string | undefined,
          ...governedFields,
          quantity: parseWorkOrderQuantity(body.quantity, 1),
          deliveryDate: parseRequiredDate(body.deliveryDate),
          effectiveTime: parseOptionalDate(body.effectiveTime),
          status: mapWorkOrderStatus(body.status),
          isDeleted: false,
          updatedAt: new Date(),
        },
      });
      await recordBusinessAuditLog(event, {
        userId: userinfo.id,
        action: 'CREATE',
        targetType: 'work_order',
        targetId: String(newWO.workOrderNumber),
        detailsTemplate: '新增工单: {{workOrderNumber}} ({{customerName}})',
        detailsVariables: {
          customerName: newWO.customerName,
          workOrderNumber: newWO.workOrderNumber,
        },
      });
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
    } catch (error) {
      if (isPrismaUniqueConflictError(error))
        throw new Error('CONFLICT:工单号已存在，请使用其他编号');
      if (isPrismaRequiredValueError(error))
        throw new Error('BAD_REQUEST:请求参数错误');
      throw error;
    }
  },
  async update(
    event: H3Event,
    id: string,
    body: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.customerName !== undefined)
      Object.assign(
        updateData,
        buildGovernedWriteFieldsForTable('work_orders', {
          customerName: body.customerName,
        }),
      );
    if (body.division !== undefined)
      Object.assign(
        updateData,
        buildGovernedWriteFieldsForTable('work_orders', {
          division: body.division,
        }),
      );
    if (body.projectName !== undefined)
      updateData.projectName = body.projectName;
    if (body.quantity !== undefined && body.quantity !== null)
      updateData.quantity = parseWorkOrderQuantity(body.quantity, 1);
    if (body.deliveryDate !== undefined && body.deliveryDate !== null)
      updateData.deliveryDate = parseRequiredDate(body.deliveryDate);
    if (body.effectiveTime !== undefined)
      updateData.effectiveTime = parseOptionalDate(body.effectiveTime);
    if (body.workOrderNumber && body.workOrderNumber !== id)
      updateData.workOrderNumber = body.workOrderNumber;
    if (body.status) updateData.status = mapWorkOrderStatus(body.status);
    try {
      const updated = await prisma.work_orders.update({
        where: { workOrderNumber: id },
        data: updateData,
      });
      await recordBusinessAuditLog(event, {
        userId: userinfo.id,
        action: 'UPDATE',
        targetType: 'work_order',
        targetId: String(id),
        detailsTemplate: '修改工单: {{workOrderNumber}} ({{customerName}})',
        detailsVariables: {
          customerName: updated.customerName,
          workOrderNumber: updated.workOrderNumber,
        },
      });
      return null;
    } catch (error) {
      if (isPrismaNotFoundError(error))
        throw new BusinessError('NOT_FOUND', `工单不存在: ${id}`, 404);
      throw error;
    }
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
        await prisma.work_orders.upsert({
          where: { workOrderNumber: woNumber },
          update: {
            customerName: item.customerName
              ? String(item.customerName)
              : undefined,
            projectName: item.projectName
              ? String(item.projectName)
              : undefined,
            ...buildGovernedWriteFieldsForTable('work_orders', {
              customerName: item.customerName,
              division: item.division,
            }),
            quantity:
              item.quantity !== undefined && item.quantity !== null
                ? parseWorkOrderQuantity(item.quantity, 1)
                : undefined,
            deliveryDate: parseRequiredDate(item.deliveryDate),
            effectiveTime: parseOptionalDate(item.effectiveTime),
            status: mapWorkOrderStatus(item.status),
            isDeleted: false,
          },
          create: {
            workOrderNumber: woNumber,
            customerName: String(item.customerName || '未知客户'),
            projectName: String(item.projectName || ''),
            ...buildGovernedWriteFieldsForTable('work_orders', {
              customerName: item.customerName,
              division: item.division,
            }),
            quantity: parseWorkOrderQuantity(item.quantity, 1),
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
  async getRequirements(workOrderNumber: string) {
    return WorkOrderRequirementRouteService.getRequirements(workOrderNumber);
  },
  async exportList(
    event: H3Event,
    query: Record<string, unknown>,
    userinfo: UserSession,
  ) {
    const MAX_EXPORT_ROWS = 20_000;
    const params = parseWorkOrderListQuery(query);
    const result = await WorkOrderService.getList({
      ...params,
      page: 1,
      pageSize: MAX_EXPORT_ROWS + 1,
    });
    if ((result.total || 0) > MAX_EXPORT_ROWS)
      throw new Error(
        `BAD_REQUEST:导出数据量超过上限（${MAX_EXPORT_ROWS} 条），请缩小筛选范围后重试`,
      );
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
  async getWorkOrderAggregate(workOrderNumber: string) {
    return WorkOrderRequirementRouteService.getWorkOrderAggregate(
      workOrderNumber,
    );
  },
};
