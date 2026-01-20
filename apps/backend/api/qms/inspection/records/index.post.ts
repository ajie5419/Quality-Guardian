import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
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

  const body = await readBody(event);

  // 映射 body.type 到正确的 category 枚举 (INCOMING, PROCESS, OUTGOING)
  let category = 'PROCESS';
  const typeLower = String(body.type || '').toLowerCase();
  if (typeLower === 'incoming') category = 'INCOMING';
  else if (typeLower === 'shipment' || typeLower === 'outgoing')
    category = 'OUTGOING';

  // 详情字段处理：如果 results 存在，则序列化存入 details
  let detailsStr = body.details || body.description || '';
  if (body.results && Array.isArray(body.results)) {
    detailsStr = JSON.stringify(body.results);
  }

  try {
    const newRecord = await prisma.inspections.create({
      data: {
        id: `REC-${Date.now()}`,
        serialNumber: Math.floor(Date.now() / 1000),
        date: new Date(body.reportDate || body.inspectionDate || Date.now()),
        category,
        result: body.result || 'PASS',
        qualityRecordFilled: false,

        // Relations
        workOrderNumber: body.workOrderNumber || 'WO-DEFAULT',
        qualityPlanId: body.itpProjectId, // 修复：关键联动字段
        inspector: userinfo.username,

        quantity: Number(body.quantity) || 0,
        projectName: body.projectName,
        incomingType: body.incomingType,
        partName: body.partName || body.componentName,
        itemName: body.materialName || body.itemName,
        supplierName: body.supplierName,
        processName: body.process,
        firstLevelPartName: body.level1Component,
        team: body.team,
        reporter: body.reporter,
        shippingDocs: body.documents || body.hasDocuments,
        isArchived:
          body.archived === '是' ||
          body.packingListArchived === '是' ||
          body.isArchived === true,
        details: detailsStr,
        remarks: body.remarks,
        updatedAt: new Date(),
      },
    });

    // Auto-complete linked task if exists
    if (body.taskId) {
      await prisma.qms_task_dispatches.update({
        where: { id: body.taskId },
        data: {
          status: 'COMPLETED',
          updatedAt: new Date(),
        },
      });
    }

    return useResponseSuccess(newRecord);
  } catch (error) {
    console.error('Create inspection record error', error);
    return useResponseError(`Create Failed: ${error.message}`);
  }
});
