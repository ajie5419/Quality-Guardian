import { OUTSOURCING_CATEGORY } from '~/modules/supplier/supplier-query';
import { parseWorkOrderListQuery } from '~/modules/work-order/work-order-query';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

type DeptRow = { id: string; name: string; parentId: string };

function collectLeafDepartments(rows: DeptRow[]) {
  const childrenMap = new Map<string, DeptRow[]>();
  for (const row of rows)
    childrenMap.set(row.parentId, [
      ...(childrenMap.get(row.parentId) || []),
      row,
    ]);
  const result: DeptRow[] = [];
  const walk = (row: DeptRow) => {
    const children = childrenMap.get(row.id) || [];
    if (children.length === 0) return void result.push(row);
    for (const child of children) walk(child);
  };
  const productionRoots = rows.filter(
    (row) => row.name.includes('生产') || row.name.includes('制造'),
  );
  if (productionRoots.length > 0) {
    for (const root of productionRoots) walk(root);
    return result;
  }
  return rows.filter((row) => (childrenMap.get(row.id) || []).length === 0);
}

export const InspectionPublicQueryService = {
  async getPublicProcesses(workOrderNumber: string) {
    const list = await prisma.work_order_requirements.findMany({
      where: { isDeleted: false, status: 'active', workOrderNumber },
      orderBy: [{ updatedAt: 'desc' }],
      select: { process: { select: { name: true } }, processName: true },
    });
    return [
      ...new Set(
        list.map((item) => resolveCanonicalProcessName(item)).filter(Boolean),
      ),
    ].map((processName) => ({ processName }));
  },

  async getPublicTeams(keyword: string) {
    const [departments, suppliers] = await Promise.all([
      prisma.departments.findMany({
        where: { isDeleted: false, status: 1 },
        orderBy: { sort: 'asc' },
        select: { id: true, name: true, parentId: true },
      }),
      prisma.suppliers.findMany({
        where: {
          category: OUTSOURCING_CATEGORY,
          isDeleted: false,
          ...(keyword ? { name: { contains: keyword } } : {}),
        },
        orderBy: { name: 'asc' },
        take: 100,
        select: { name: true },
      }),
    ]);
    const internalTeams = collectLeafDepartments(departments)
      .filter((item) => !keyword || item.name.includes(keyword))
      .map((item) => ({
        group: 'internal' as const,
        label: item.name,
        value: item.name,
      }));
    const externalTeams = suppliers.map((item) => ({
      group: 'external' as const,
      label: item.name,
      value: item.name,
    }));
    return [...internalTeams, ...externalTeams];
  },

  async getPublicWorkOrders(query: Record<string, unknown>) {
    const params = parseWorkOrderListQuery({
      ...query,
      ignoreYearFilter: true,
      pageSize: query.pageSize || 20,
    });
    const where: Record<string, unknown> = { isDeleted: false };
    if (params.keyword) {
      where.OR = [
        { workOrderNumber: { contains: params.keyword } },
        { projectName: { contains: params.keyword } },
      ];
    } else if (params.workOrderNumber) {
      where.workOrderNumber = { contains: params.workOrderNumber };
    }
    const [items, total] = await Promise.all([
      prisma.work_orders.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          projectName: true,
          quantity: true,
          status: true,
          workOrderNumber: true,
        },
      }),
      prisma.work_orders.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        createTime: null,
        customerName: null,
        deliveryDate: null,
        id: item.workOrderNumber,
        projectName: item.projectName || null,
        quantity: item.quantity || 0,
        status: item.status,
        workOrderNumber: item.workOrderNumber,
      })),
      total,
    };
  },
};
