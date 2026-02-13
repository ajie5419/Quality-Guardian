import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getMetadata } from '~/utils/metadata';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    const [projects, metadataMap] = await Promise.all([
      prisma.work_orders.findMany({
        where: {
          isDeleted: false,
          project_boms: { some: {} },
        },
        include: {
          _count: { select: { project_boms: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      getMetadata<Record<string, { status?: string; version?: string }>>(
        'BOM_PROJECT_METADATA',
        {},
      ),
    ]);

    const data = projects.map((p) => {
      const meta = metadataMap[p.workOrderNumber] || {};
      return {
        id: p.workOrderNumber,
        projectName: p.projectName,
        workOrderNumber: p.workOrderNumber,
        itemCount: p._count.project_boms,
        version: meta.version || 'V1.0',
        status: meta.status || 'active',
      };
    });

    return useResponseSuccess(data);
  } catch (error) {
    logApiError('bom-projects', error);
    setResponseStatus(event, 500);
    return useResponseError('获取 BOM 项目失败');
  }
});
