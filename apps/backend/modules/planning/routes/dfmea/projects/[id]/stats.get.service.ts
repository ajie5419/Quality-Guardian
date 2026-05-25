import type { H3Event } from 'h3';

import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function dfmea_projects_id_stats_get(event: H3Event) {
  const projectId = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof projectId !== 'string') {
    return projectId;
  }

  try {
    const [project, projectItems] = await Promise.all([
      // governance-allow-direct-canonical-read: stats page projects by route id and displays label only.
      prisma.dfmea_projects.findUnique({
        where: { id: projectId },
        select: { projectName: true },
      }),
      prisma.dfmea.findMany({
        where: {
          projectId,
          isDeleted: false,
        },
      }),
    ]);

    if (!project || projectItems.length === 0) {
      return useResponseSuccess({
        projectId,
        projectName: project?.projectName || '',
        itemCount: 0,
        avgRpn: 0,
        maxRpn: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
      });
    }

    const itemCount = projectItems.length;
    const totalRpn = projectItems.reduce((sum, item) => sum + item.rpn, 0);
    const avgRpn = Math.round((totalRpn / itemCount) * 100) / 100;
    const maxRpn = Math.max(...projectItems.map((item) => item.rpn));

    const highRiskCount = projectItems.filter((item) => item.rpn > 100).length;
    const mediumRiskCount = projectItems.filter(
      (item) => item.rpn > 50 && item.rpn <= 100,
    ).length;
    const lowRiskCount = projectItems.filter((item) => item.rpn <= 50).length;

    return useResponseSuccess({
      projectId,
      projectName: project.projectName,
      itemCount,
      avgRpn,
      maxRpn,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
    });
  } catch (error) {
    logApiError('dfmea-project-stats', error, undefined, event);
    return internalServerErrorResponse(event, '获取 DFMEA 项目统计失败');
  }
}
