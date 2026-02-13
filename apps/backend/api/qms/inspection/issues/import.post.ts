import { defineEventHandler, readBody, setResponseStatus } from 'h3';
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
  const userinfo = verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const body = await readBody(event);
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      setResponseStatus(event, 400);
      return useResponseError('未发现可导入的数据');
    }

    let successCount = 0;
    let serialSeed = await getNextInspectionIssueSerialNumber();
    for (const item of items) {
      try {
        const ncNumber = String(
          item.nonConformanceNumber || item.ncNumber || '',
        ).trim();
        if (!ncNumber) continue;
        const status = toQualityRecordStatus(item.status);

        await prisma.quality_records.upsert({
          where: { nonConformanceNumber: ncNumber },
          update: {
            partName: item.partName ? String(item.partName) : undefined,
            description: item.description
              ? String(item.description)
              : undefined,
            quantity: item.quantity ? Number(item.quantity) : undefined,
            projectName: item.projectName
              ? String(item.projectName)
              : undefined,
            responsibleDepartment: item.responsibleDepartment
              ? String(item.responsibleDepartment)
              : undefined,
            status,
          },
          create: {
            id: createInspectionIssueId(),
            serialNumber: serialSeed++,
            date: new Date(),
            status,
            partName: String(item.partName || '未知零件'),
            description: String(item.description || ''),
            quantity: Number(item.quantity) || 0,
            projectName: String(item.projectName || ''),
            division: String(item.division || ''),
            responsibleDepartment: String(
              item.responsibleDepartment || '质量部',
            ),
            nonConformanceNumber: ncNumber,
            workOrderNumber: item.workOrderNumber
              ? String(item.workOrderNumber)
              : null,
          },
        });
        successCount++;
      } catch (error) {
        logApiError('import', error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch (error: unknown) {
    logApiError('import', error);
    setResponseStatus(event, 500);
    return useResponseError('数据解析失败');
  }
});
