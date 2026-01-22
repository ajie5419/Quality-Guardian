import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
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
      return useResponseError('未发现可导入的数据');
    }

    let successCount = 0;
    for (const item of items) {
      try {
        const ncNumber = String(
          item.nonConformanceNumber || item.ncNumber || '',
        ).trim();
        if (!ncNumber) continue;

        const id = `QR-${Date.now()}-${Math.random().toString(36).slice(-4)}`;

        // 状态映射
        let status: any = 'OPEN';
        const s = String(item.status || '').toUpperCase();
        if (s.includes('CLOSE') || s.includes('解决')) status = 'RESOLVED';
        if (s.includes('PROGRESS') || s.includes('处理'))
          status = 'IN_PROGRESS';

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
            id,
            serialNumber: Math.floor(Math.random() * 1_000_000),
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
        console.error('Import failed for issue:', item.ncNumber, error);
      }
    }

    return useResponseSuccess({ successCount, totalCount: items.length });
  } catch {
    return useResponseError('数据解析失败');
  }
});
