import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { MOCK_DELAY } from '~/utils/index';
import { parseItpQuantitativeItems, toItpPlanStatusText } from '~/utils/itp';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
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
        where: { isDeleted: false },
        include: {
          items: true,
        },
      }),
    ]);

    // Build a map of WorkOrder -> Inspections for faster lookup
    const inspectionMap = new Map<string, typeof inspections>();
    inspections.forEach((insp) => {
      const wo = insp.workOrderNumber;
      if (!inspectionMap.has(wo)) {
        inspectionMap.set(wo, []);
      }
      inspectionMap.get(wo)?.push(insp);
    });

    const treeData = projects.map((project) => {
      // Get inspections for this project's work order
      const projectInspections =
        inspectionMap.get(project.workOrderNumber) || [];

      const processedItems = project.items.map((item) => {
        // Find all inspection items that match this ITP item (by activity name)
        // logic: for each inspection in this WO, check its items for a match
        const matchedExecutionItems: {
          overallResult: string;
          result: string;
        }[] = [];

        projectInspections.forEach((insp) => {
          const matchedItem = insp.items.find(
            (i) => i.checkItem === item.activity,
          );
          if (matchedItem) {
            matchedExecutionItems.push({
              overallResult: insp.result || 'PASS',
              result: matchedItem.result,
            });
          }
        });

        let executionStatus = 'PENDING'; // 默认未开始
        if (matchedExecutionItems.length > 0) {
          const hasFail = matchedExecutionItems.some(
            (h) => h.result === 'FAIL',
          );
          executionStatus = hasFail ? 'FAILED' : 'COMPLETED';
        }

        return {
          ...item,
          type: 'item',
          name: item.activity,
          parentId: project.id,
          executionStatus,
          executionCount: matchedExecutionItems.length,
          quantitativeItems: parseItpQuantitativeItems(item.quantitativeItems),
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
        status: toItpPlanStatusText(project.planStatus),
        itemCount: processedItems.length,
        completedCount,
        progress,
        children: processedItems,
      };
    });

    return useResponseSuccess(treeData);
  } catch (error) {
    logApiError('itp-tree', error);
    setResponseStatus(event, 500);
    return useResponseError('获取 ITP 树失败');
  }
});
