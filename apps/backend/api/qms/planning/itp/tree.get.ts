import { defineEventHandler } from 'h3';
import { MOCK_DELAY } from '~/utils/index';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));

  try {
    const [projects, inspections] = await Promise.all([
      prisma.quality_plans.findMany({
        where: { isDeleted: false },
        include: {
          items: {
            where: { isDeleted: false },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inspections.findMany({
        where: { isDeleted: false, NOT: { details: null } },
        select: { details: true, qualityPlanId: true, result: true },
      }),
    ]);

    // 预处理检验记录，建立 itpItemId -> results 映射
    interface ExecutionInfo {
      itpItemId: string;
      result: string;
      [key: string]: unknown;
    }
    const executionMap = new Map<
      string,
      Array<{ overallResult: string; result: string }>
    >();
    inspections.forEach((record) => {
      if (!record.details || !record.qualityPlanId) return;
      try {
        const results = JSON.parse(record.details);
        if (Array.isArray(results)) {
          results.forEach((res: ExecutionInfo) => {
            const key = `${record.qualityPlanId}_${res.itpItemId}`;
            let list = executionMap.get(key);
            if (!list) {
              list = [];
              executionMap.set(key, list);
            }
            list.push({
              overallResult: record.result || 'PASS',
              result: res.result,
            });
          });
        }
      } catch {}
    });

    const treeData = projects.map((project) => {
      const processedItems = project.items.map((item) => {
        const key = `${project.id}_${item.id}`;
        const history = executionMap.get(key) || [];

        let executionStatus = 'PENDING'; // 默认未开始
        if (history.length > 0) {
          const hasFail = history.some((h) => h.result === 'FAIL');
          executionStatus = hasFail ? 'FAILED' : 'COMPLETED';
        }

        return {
          ...item,
          type: 'item',
          name: item.activity,
          parentId: project.id,
          executionStatus,
          executionCount: history.length,
          quantitativeItems: item.quantitativeItems ? JSON.parse(item.quantitativeItems) : [],
        };
      });

      // 计算项目进度
      const completedCount = processedItems.filter(
        (i) => i.executionStatus !== 'PENDING',
      ).length;
      const progress =
        processedItems.length > 0
          ? Math.round((completedCount / processedItems.length) * 100)
          : 0;

      return {
        id: project.id,
        type: 'project',
        name: project.projectName,
        projectName: project.projectName,
        workOrderId: project.workOrderNumber,
        version: project.version?.toString() || 'V1.0',
        status: project.planStatus?.toLowerCase() || 'draft',
        itemCount: processedItems.length,
        completedCount,
        progress,
        children: processedItems,
      };
    });

    return {
      code: 0,
      data: treeData,
      message: 'ok',
    };
  } catch (error) {
    console.error('Fetch ITP tree error:', error);
    return { code: 0, data: [], message: 'error' };
  }
});
