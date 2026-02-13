import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  normalizeBomProjectStatus,
  normalizeBomProjectVersion,
} from '~/utils/bom';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { getMetadata } from '~/utils/metadata';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  unAuthorizedResponse,
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
        version: normalizeBomProjectVersion(meta.version),
        status: normalizeBomProjectStatus(meta.status),
      };
    });

    return useResponseSuccess(data);
  } catch (error) {
    logApiError('bom-projects', error);
    return internalServerErrorResponse(event, '获取 BOM 项目失败');
  }
});
