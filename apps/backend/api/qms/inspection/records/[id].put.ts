import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { DETAILED_INSPECTIONS_LIST } from '~/utils/qms-data';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('id required');

  const body = await readBody(event);

  // 1. Check if it's a Detailed Mock Record (memory list - legacy compatibility)
  const mockIndex = DETAILED_INSPECTIONS_LIST.findIndex((i) => i.id === id);
  if (mockIndex !== -1) {
    const updatedItem = {
      ...DETAILED_INSPECTIONS_LIST[mockIndex],
      ...body,
      updatedAt: new Date().toISOString(),
    };
    DETAILED_INSPECTIONS_LIST[mockIndex] = updatedItem;
    return useResponseSuccess(updatedItem);
  }

  // 2. Update database via Prisma
  const dataUpdate: Record<string, unknown> = {};

  if (body.result) dataUpdate.result = body.result;
  if (body.quantity !== undefined) dataUpdate.quantity = Number(body.quantity);
  if (body.remarks) dataUpdate.remarks = body.remarks;
  if (body.reportDate) dataUpdate.date = new Date(body.reportDate);

  // Results JSON handling
  if (body.results && Array.isArray(body.results)) {
    dataUpdate.details = JSON.stringify(body.results);
  } else if (body.details || body.description) {
    dataUpdate.details = body.details || body.description;
  }

  // Mapping
  if (body.projectName !== undefined) dataUpdate.projectName = body.projectName;
  if (body.partName !== undefined) dataUpdate.partName = body.partName;
  if (body.componentName !== undefined)
    dataUpdate.partName = body.componentName;
  if (body.materialName !== undefined) dataUpdate.itemName = body.materialName;
  if (body.supplierName !== undefined)
    dataUpdate.supplierName = body.supplierName;
  if (body.process !== undefined) dataUpdate.processName = body.process;
  if (body.level1Component !== undefined)
    dataUpdate.firstLevelPartName = body.level1Component;
  if (body.team !== undefined) dataUpdate.team = body.team;
  if (body.reporter !== undefined) dataUpdate.reporter = body.reporter;
  if (body.incomingType !== undefined)
    dataUpdate.incomingType = body.incomingType;

  if (body.documents !== undefined) dataUpdate.shippingDocs = body.documents;
  if (body.hasDocuments !== undefined)
    dataUpdate.shippingDocs = body.hasDocuments;

  if (body.archived !== undefined || body.packingListArchived !== undefined) {
    dataUpdate.isArchived =
      body.archived === '是' || body.packingListArchived === '是';
  }

  // Relations
  if (body.workOrderNumber) dataUpdate.workOrderNumber = body.workOrderNumber;
  if (body.itpProjectId) dataUpdate.qualityPlanId = body.itpProjectId; // 修复：保存关联

  dataUpdate.updatedAt = new Date();

  try {
    const updated = await prisma.inspections.update({
      where: { id },
      data: dataUpdate,
    });
    return useResponseSuccess(updated);
  } catch (error) {
    console.error('Update inspection failed', error);
    return useResponseError(`Update failed: ${error.message}`);
  }
});
