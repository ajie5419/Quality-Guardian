import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  // 1. Read Body & Logging
  const body = await readBody(event);

  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    // Map Status - Unified to uppercase Enum keys
    let status = 'OPEN';
    const statusBody = String(body.status || '').toUpperCase();
    if (statusBody === 'CLOSED' || statusBody === '已关闭') status = 'CLOSED';
    else if (statusBody === 'IN_PROGRESS' || statusBody === '进行中')
      status = 'IN_PROGRESS';
    else status = 'OPEN';

    // Ensure ID logic is clean
    const currentYear = new Date().getFullYear();
    const newId = `ISS-${currentYear}-${Date.now()}`;

    const newRecord = await prisma.quality_records.create({
      data: {
        id: newId,
        serialNumber: Math.floor(Date.now() / 1000),
        date: new Date(body.reportDate || Date.now()),
        status: status as 'CLOSED' | 'IN_PROGRESS' | 'OPEN',
        nonConformanceNumber: body.ncNumber || null,

        work_orders: body.workOrderNumber
          ? { connect: { workOrderNumber: body.workOrderNumber } }
          : undefined,

        projectName: body.projectName,
        processName: body.processName,
        partName: body.partName || 'Unknown',
        division: body.division,

        defectType: body.defectType,
        defectSubtype: body.defectSubtype,
        rootCause: body.rootCause,
        solution: body.solution,

        description: body.description,
        quantity: Number(body.quantity) || 1,
        lossAmount: Number(body.lossAmount) || 0,

        responsibleDepartment: body.responsibleDepartment || 'Unknown',
        supplierName: body.supplierName || null,

        // Logic to connect user by name (from Mock Data Era)
        // Since we migrated Auth to DB, userinfo.username exists in DB.
        // We should connect to EXISTING user if possible.
        // Using connectOrCreate for safety if logic differs.
        // Connect to inspector user (must be valid username)
        users_quality_records_inspectorTousers: userinfo.username
          ? { connect: { username: userinfo.username } }
          : undefined,

        isClaim: body.claim === 'Yes',

        // Photo Persistence Logic
        issuePhoto: body.photos ? JSON.stringify(body.photos) : '[]',

        isDeleted: false,
        updatedAt: new Date(),
      },
    });

    return useResponseSuccess({
      ...newRecord,
      ncNumber: newRecord.nonConformanceNumber,
    });
  } catch (error) {
    logApiError('issues', error);
    return useResponseError(`创建问题失败: ${error.message}`);
  }
});
