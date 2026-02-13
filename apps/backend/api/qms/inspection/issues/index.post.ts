import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import {
  createInspectionIssueId,
  getNextInspectionIssueSerialNumber,
} from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { toQualityRecordStatus } from '~/utils/quality-loss-status';
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

  try {
    const body = await readBody(event);
    const status = toQualityRecordStatus(body.status);
    const newId = createInspectionIssueId();
    const serialNumber = await getNextInspectionIssueSerialNumber();

    const newRecord = await prisma.quality_records.create({
      data: {
        id: newId,
        serialNumber,
        date: new Date(body.reportDate || Date.now()),
        status,
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

    await SystemLogService.recordAuditLog({
      userId: String(userinfo.id),
      action: 'CREATE',
      targetType: 'inspection_issue',
      targetId: String(newRecord.id),
      details: `新增检验问题: ${newRecord.partName} (${newRecord.nonConformanceNumber || '无编号'})`,
    });

    return useResponseSuccess({
      ...newRecord,
      ncNumber: newRecord.nonConformanceNumber,
    });
  } catch (error) {
    logApiError('issues', error);
    const errorCode = (error as { code?: string }).code;
    setResponseStatus(event, errorCode === 'P2002' ? 409 : 500);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(`创建问题失败: ${errorMessage}`);
  }
});
