import { defineEventHandler, getRouterParam, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id');
  if (!projectId) {
    setResponseStatus(event, 400);
    return useResponseError('id required');
  }

  try {
    const [project, projectItems] = await Promise.all([
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
    logApiError('dfmea-project-stats', error);
    setResponseStatus(event, 500);
    return useResponseError('获取 DFMEA 项目统计失败');
  }
});
