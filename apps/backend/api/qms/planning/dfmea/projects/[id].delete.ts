import { defineEventHandler, getRouterParam } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import { DFMEA_LIST, DFMEA_PROJECTS_LIST } from '~/utils/qms-data';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = getRouterParam(event, 'id');

  const projectIndex = DFMEA_PROJECTS_LIST.findIndex((p) => p.id === id);
  if (projectIndex === -1) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Project not found',
    });
  }

  // 删除项目及其所有关联的 DFMEA 条目
  DFMEA_PROJECTS_LIST.splice(projectIndex, 1);
  const itemIndices = DFMEA_LIST.filter((item) => item.projectId === id);
  itemIndices.forEach((item) => {
    const idx = DFMEA_LIST.indexOf(item);
    if (idx !== -1) {
      DFMEA_LIST.splice(idx, 1);
    }
  });

  return {
    code: 0,
    data: null,
    message: 'ok',
  };
});
