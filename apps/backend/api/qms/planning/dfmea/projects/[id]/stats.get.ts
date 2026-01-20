import { defineEventHandler, getRouterParam } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import { DFMEA_LIST } from '~/utils/qms-data';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const projectId = getRouterParam(event, 'id');

  const projectItems = DFMEA_LIST.filter(
    (item) => item.projectId === projectId,
  );

  if (projectItems.length === 0) {
    return {
      code: 0,
      data: {
        projectId,
        projectName: '',
        itemCount: 0,
        avgRpn: 0,
        maxRpn: 0,
        highRiskCount: 0,
        mediumRiskCount: 0,
        lowRiskCount: 0,
      },
      message: 'ok',
    };
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

  return {
    code: 0,
    data: {
      projectId,
      projectName: projectItems[0].item, // 使用第一个条目的item作为项目名
      itemCount,
      avgRpn,
      maxRpn,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
    },
    message: 'ok',
  };
});
