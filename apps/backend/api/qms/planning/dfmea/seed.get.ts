import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { calculateDfmeaRpn, createDfmeaProjectId } from '~/utils/dfmea';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

const SEED_PROJECTS = [
  {
    description: '液压泵核心组件的 DFMEA 分析',
    items: [
      {
        detection: 5,
        effect: '液压油泄漏，系统压力下降',
        failureMode: '铸造裂纹',
        function: '承压并支撑内部组件',
        item: '泵壳体',
        occurrence: 2,
        order: 1,
        severity: 8,
      },
      {
        detection: 3,
        effect: '环境污染，轴承损坏',
        failureMode: '密封圈磨损',
        function: '防止轴端漏油',
        item: '主轴密封',
        occurrence: 4,
        order: 2,
        severity: 7,
      },
    ],
    projectName: '液压泵 X1 项目',
    workOrderId: 'WO-2024001',
  },
  {
    description: '高精度传感器模块的失效模式分析',
    items: [
      {
        detection: 4,
        effect: '信号中断或噪声干扰',
        failureMode: '引脚松动',
        function: '电信号传输',
        item: '信号连接器',
        occurrence: 2,
        order: 1,
        severity: 9,
      },
    ],
    projectName: '传感器模块 S5 项目',
    workOrderId: 'WO-2024003',
  },
] as const;

export default defineEventHandler(async (event) => {
  try {
    const existingNames = await prisma.dfmea_projects.findMany({
      select: { projectName: true },
      where: {
        isDeleted: false,
        projectName: {
          in: SEED_PROJECTS.map((project) => project.projectName),
        },
      },
    });
    const existingNameSet = new Set(
      existingNames.map((item) => item.projectName),
    );

    const workOrderIds = [
      ...new Set(SEED_PROJECTS.map((project) => project.workOrderId)),
    ];
    const existingWorkOrders = await prisma.work_orders.findMany({
      select: { workOrderNumber: true },
      where: { workOrderNumber: { in: workOrderIds } },
    });
    const workOrderSet = new Set(
      existingWorkOrders.map((item) => item.workOrderNumber),
    );

    let createdCount = 0;
    let skippedCount = 0;
    for (const project of SEED_PROJECTS) {
      if (existingNameSet.has(project.projectName)) {
        skippedCount++;
        continue;
      }

      await prisma.dfmea_projects.create({
        data: {
          createdBy: 'seed',
          description: project.description,
          id: createDfmeaProjectId(),
          isDeleted: false,
          projectName: project.projectName,
          status: 'active',
          version: 'V1.0',
          workOrderId: workOrderSet.has(project.workOrderId)
            ? project.workOrderId
            : null,
          items: {
            create: project.items.map((item) => ({
              detection: item.detection,
              effect: item.effect,
              failureMode: item.failureMode,
              function: item.function,
              item: item.item,
              occurrence: item.occurrence,
              order: item.order,
              rpn: calculateDfmeaRpn(
                item.severity,
                item.occurrence,
                item.detection,
              ),
              severity: item.severity,
            })),
          },
        },
      });
      createdCount++;
    }

    return useResponseSuccess({
      createdCount,
      skippedCount,
      totalCount: SEED_PROJECTS.length,
    });
  } catch (error: unknown) {
    logApiError('dfmea-seed', error);
    setResponseStatus(event, 500);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return useResponseError(`初始化 DFMEA 种子数据失败: ${errorMessage}`);
  }
});
