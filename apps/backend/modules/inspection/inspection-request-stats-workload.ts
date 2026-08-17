import prisma from '~/utils/prisma';

/**
 * 检验员在办任务数（DISPATCHED/INSPECTING），供用户管理列表复用（M-G08）。
 * 独立文件：避免 inspection-request-stats.service 的 supplier-identity/team/dept
 * 顶层依赖进入 inspection/index 导出链，造成与 quality-loss 等模块的加载循环。
 */
export async function getInspectorActiveTaskCounts(): Promise<
  Map<string, number>
> {
  const rows = await prisma.qms_inspection_requests.groupBy({
    by: ['inspectorId'],
    where: {
      inspectorId: { not: null },
      isDeleted: false,
      status: { in: ['DISPATCHED', 'INSPECTING'] },
    },
    _count: { id: true },
  });
  return new Map(rows.map((row) => [row.inspectorId as string, row._count.id]));
}
