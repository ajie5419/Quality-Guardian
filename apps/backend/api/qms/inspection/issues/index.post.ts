import { defineEventHandler, readBody } from 'h3';
import { SystemLogService } from '~/services/system-log.service';
import { logApiError } from '~/utils/api-logger';
import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  getNextInspectionIssueSerialNumber,
} from '~/utils/inspection-issue';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';
import {
  conflictResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const newId = createInspectionIssueId();
    const serialNumber = await getNextInspectionIssueSerialNumber();

    const newRecord = await prisma.quality_records.create({
      data: buildInspectionIssueCreateData(body as Record<string, unknown>, {
        id: newId,
        inspectorUsername: userinfo.username,
        serialNumber,
      }),
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
    if (isPrismaUniqueConstraintError(error)) {
      return conflictResponse(event, 'NC number already exists');
    }
    return internalServerErrorResponse(event, 'Failed to create issue');
  }
});
