import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  try {
    const _project1 = await prisma.dfmea_projects.create({
      data: {
        projectName: '液压泵 X1 项目',
        workOrderId: 'WO-2024001',
        status: 'active',
        description: '液压泵核心组件的 DFMEA 分析',
        items: {
          create: [
            {
              item: '泵壳体',
              function: '承压并支撑内部组件',
              failureMode: '铸造裂纹',
              effect: '液压油泄漏，系统压力下降',
              severity: 8,
              occurrence: 2,
              detection: 5,
              rpn: 80,
              order: 1,
            },
            {
              item: '主轴密封',
              function: '防止轴端漏油',
              failureMode: '密封圈磨损',
              effect: '环境污染，轴承损坏',
              severity: 7,
              occurrence: 4,
              detection: 3,
              rpn: 84,
              order: 2,
            },
          ],
        },
      },
    });

    const _project2 = await prisma.dfmea_projects.create({
      data: {
        projectName: '传感器模块 S5 项目',
        workOrderId: 'WO-2024003',
        status: 'active',
        description: '高精度传感器模块的失效模式分析',
        items: {
          create: [
            {
              item: '信号连接器',
              function: '电信号传输',
              failureMode: '引脚松动',
              effect: '信号中断或噪声干扰',
              severity: 9,
              occurrence: 2,
              detection: 4,
              rpn: 72,
              order: 1,
            },
          ],
        },
      },
    });

    return { success: true, count: 2 };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
