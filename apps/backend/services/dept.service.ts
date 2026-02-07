import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

export interface CreateDeptDto {
  name: string;
  parentId?: string;
  pid?: string;
  businessUnit?: string;
  remark?: string;
  description?: string;
  status?: number;
  orderNo?: number;
  sort?: number;
}

export interface UpdateDeptDto {
  name?: string;
  parentId?: string;
  pid?: string;
  businessUnit?: string;
  remark?: string;
  description?: string;
  status?: number;
  orderNo?: number;
  sort?: number;
}

interface DeptItem {
  createdAt?: Date | string;
  description?: null | string;
  id: string;
  name: string;
  parentId?: null | string;
  businessUnit?: null | string;
  status?: number | string; // Adjusted to match Prisma
  sort?: null | number;
}

interface DeptNode extends DeptItem {
  children: DeptNode[];
  createTime: string;
  remark: string;
}

// Helper: Build Tree
function buildDeptTree(items: DeptItem[]) {
  const result: DeptNode[] = [];
  const map: Record<string, DeptNode> = {};

  // First pass
  items.forEach((item) => {
    map[item.id] = {
      ...item,
      children: [],
      createTime: item.createdAt
        ? new Date(item.createdAt).toLocaleString('zh-CN')
        : '',
      remark: item.description || '',
    };
  });

  // Second pass
  items.forEach((item) => {
    const node = map[item.id];
    if (item.parentId && item.parentId !== '0' && map[item.parentId]) {
      map[item.parentId].children.push(node);
    } else {
      result.push(node);
    }
  });

  return result;
}

export const DeptService = {
  /**
   * Get all departments as a tree
   */
  async findAll() {
    // Cache key: qms:dept:tree
    const cached = await redis.get('qms:dept:tree');
    if (cached) {
      console.warn('[Dept Cache] HIT - Key: qms:dept:tree');
      return cached;
    }

    const result = await (async () => {
      const departments = await prisma.departments.findMany({
        where: { isDeleted: false },
        orderBy: { sort: 'asc' },
      });

      return buildDeptTree(departments);
    })();

    console.warn('[Dept Cache] MISS - Key: qms:dept:tree');
    await redis.set('qms:dept:tree', result, 3600 * 24);
    return result;
  },

  /**
   * Create a new department
   */
  async create(data: CreateDeptDto) {
    await redis.del('qms:dept:tree');
    const newDept = await prisma.departments.create({
      data: {
        id: `dept-${Date.now()}`,
        name: data.name,
        parentId: data.parentId || data.pid || '0',
        businessUnit: data.businessUnit || null,
        description: data.remark || data.description || null,
        status: data.status ?? 1,
        sort: Number(data.orderNo || data.sort || 0),
        isDeleted: false,
        updatedAt: new Date(),
      },
    });
    return newDept;
  },

  /**
   * Update a department
   */
  async update(id: string, data: UpdateDeptDto) {
    await redis.del('qms:dept:tree');
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.businessUnit !== undefined)
      updateData.businessUnit = data.businessUnit;
    if (data.remark !== undefined) updateData.description = data.remark;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.name !== undefined) updateData.name = data.name;

    if (data.status !== undefined) updateData.status = data.status;
    if (data.parentId || data.pid)
      updateData.parentId = data.parentId || data.pid;
    if (data.orderNo || data.sort)
      updateData.sort = Number(data.orderNo || data.sort);

    await prisma.departments.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete a department
   */
  async delete(id: string) {
    await redis.del('qms:dept:tree');
    await prisma.departments.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });
  },
};
