import type { DeptTreeNode } from '~/modules/dept/dept-tree';

import { createId } from '@paralleldrive/cuid2';
import { buildDeptTree } from '~/modules/dept/dept-tree';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

export interface CreateDeptDto {
  businessUnit?: string;
  description?: string;
  name: string;
  parentId?: string;
  status?: number;
  sort?: number;
}

export interface UpdateDeptDto {
  businessUnit?: string;
  description?: string;
  name?: string;
  parentId?: string;
  status?: number;
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

export const DeptService = {
  /**
   * Get all departments as a tree
   */
  async findAll(): Promise<Array<DeptTreeNode<DeptItem>>> {
    // Cache key: qms:dept:tree
    const cached = await redis.get('qms:dept:tree');
    if (cached) {
      console.warn('[Dept Cache] HIT - Key: qms:dept:tree');
      return cached as Array<DeptTreeNode<DeptItem>>;
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

  async findActiveTree(): Promise<Array<DeptTreeNode<DeptItem>>> {
    const departments = await prisma.departments.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: { sort: 'asc' },
      select: { id: true, name: true, parentId: true },
    });
    return buildDeptTree(departments as DeptItem[]);
  },

  async findVehicleSobuIds() {
    const rows = await prisma.departments.findMany({
      select: { id: true },
      where: {
        isDeleted: false,
        name: { contains: '车辆' },
        AND: [{ name: { contains: 'SOBU' } }],
      },
    });
    return rows.map((item) => item.id).filter(Boolean);
  },

  /**
   * Create a new department
   */
  async create(data: CreateDeptDto) {
    await redis.del('qms:dept:tree');
    const newDept = await prisma.departments.create({
      data: {
        id: `dept-${createId()}`,
        name: data.name,
        parentId: data.parentId || '0',
        businessUnit: data.businessUnit || null,
        description: data.description || null,
        status: data.status ?? 1,
        sort: Number(data.sort || 0),
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
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.businessUnit !== undefined)
      updateData.businessUnit = data.businessUnit;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.name !== undefined) updateData.name = data.name;

    if (data.status !== undefined) updateData.status = data.status;
    if (data.parentId !== undefined) updateData.parentId = data.parentId;
    if (data.sort !== undefined) updateData.sort = Number(data.sort);

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
