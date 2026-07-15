import type { H3Event } from 'h3';

import {
  normalizeBomProjectStatus,
  normalizeBomProjectVersion,
} from '~/modules/planning/bom';
import { getMetadata } from '~/modules/system/metadata';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';

export async function bom_projects_index_get(event: H3Event) {
  const userinfo = verifyAccessToken(event);
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

    return useListResponseSuccess(data);
  } catch (error) {
    logApiError('bom-projects', error, undefined, event);
    return internalServerErrorResponse(event, '获取 BOM 项目失败');
  }
}
