import { Prisma } from '@prisma/client';
import prisma from '~/utils/prisma';
import { isDataScopeV2Enabled } from '~/utils/rbac-config';

type DataScopeType = 'ALL' | 'DEPT' | 'SELF';
type QmsModule =
  | 'after-sales'
  | 'inspection'
  | 'quality-loss'
  | 'supplier'
  | 'work-order';

interface UserContext {
  userId: string;
  username?: string;
}

function toStringArray(raw: null | string) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

async function getUserRoleIds(userId: string) {
  const user = await prisma.users.findFirst({
    where: { id: userId, isDeleted: false },
    select: { roleId: true },
  });
  if (!user) return [] as string[];

  const v2Links = await prisma.rbac_user_roles.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const roleIds = v2Links.length > 0 ? v2Links.map((row) => row.roleId) : [];

  return roleIds.length > 0 ? roleIds : [user.roleId];
}

async function resolveScope(
  userId: string,
  module: QmsModule,
): Promise<{ deptIds: string[]; scopeType: DataScopeType }> {
  if (!isDataScopeV2Enabled()) {
    return { scopeType: 'ALL', deptIds: [] };
  }

  const user = await prisma.users.findFirst({
    where: { id: userId, isDeleted: false },
    select: { department: true },
  });

  const roleIds = await getUserRoleIds(userId);
  if (roleIds.length === 0) {
    return user?.department
      ? { scopeType: 'DEPT', deptIds: [user.department] }
      : { scopeType: 'SELF', deptIds: [] };
  }

  const policies = await prisma.data_permission_policies.findMany({
    where: {
      roleId: { in: roleIds },
      module,
      isDeleted: false,
    },
    select: { scopeType: true, deptIds: true },
  });

  if (policies.length === 0) {
    return user?.department
      ? { scopeType: 'DEPT', deptIds: [user.department] }
      : { scopeType: 'SELF', deptIds: [] };
  }

  if (policies.some((policy) => policy.scopeType === 'ALL')) {
    return { scopeType: 'ALL', deptIds: [] };
  }

  const deptIds = policies.flatMap((policy) => toStringArray(policy.deptIds));
  if (deptIds.length > 0) {
    return { scopeType: 'DEPT', deptIds: [...new Set(deptIds)] };
  }

  return { scopeType: 'SELF', deptIds: [] };
}

export const DataScopeService = {
  async getScopeForModule(userId: string, module: QmsModule) {
    return resolveScope(userId, module);
  },

  async getDeptCandidates(deptIds: string[]) {
    const departments = await prisma.departments.findMany({
      where: { id: { in: deptIds }, isDeleted: false },
      select: { name: true },
    });
    const deptNames = departments
      .map((dept) => dept.name)
      .filter((name) => typeof name === 'string' && name.trim() !== '');
    return [...new Set([...deptIds, ...deptNames])];
  },

  async buildInspectionWhere(
    baseWhere: Prisma.quality_recordsWhereInput,
    user: UserContext,
  ): Promise<Prisma.quality_recordsWhereInput> {
    const { scopeType, deptIds } = await resolveScope(
      user.userId,
      'inspection',
    );

    if (scopeType === 'ALL') {
      return baseWhere;
    }

    if (scopeType === 'DEPT') {
      const deptCandidates = await this.getDeptCandidates(deptIds);

      return {
        AND: [
          baseWhere,
          {
            OR: [
              { responsibleDepartment: { in: deptCandidates } },
              { responsibleBU: { in: deptCandidates } },
            ],
          },
        ],
      };
    }

    return {
      AND: [
        baseWhere,
        {
          OR: [
            { inspector: user.username || '' },
            { lastEditor: user.username || '' },
          ],
        },
      ],
    };
  },

  async buildSupplierWhere(
    baseWhere: Prisma.suppliersWhereInput,
    user: UserContext,
  ): Promise<Prisma.suppliersWhereInput> {
    const { scopeType, deptIds } = await resolveScope(user.userId, 'supplier');

    if (scopeType === 'ALL') {
      return baseWhere;
    }

    if (scopeType === 'DEPT') {
      const deptCandidates = await this.getDeptCandidates(deptIds);

      return {
        AND: [baseWhere, { buyer: { in: deptCandidates } }],
      };
    }

    return {
      AND: [baseWhere, { buyer: user.username || '' }],
    };
  },

  async buildAfterSalesWhere(
    baseWhere: Prisma.after_salesWhereInput,
    user: UserContext,
  ): Promise<Prisma.after_salesWhereInput> {
    const { scopeType, deptIds } = await resolveScope(
      user.userId,
      'after-sales',
    );

    if (scopeType === 'ALL') {
      return baseWhere;
    }

    if (scopeType === 'DEPT') {
      const deptCandidates = await this.getDeptCandidates(deptIds);
      return {
        AND: [
          baseWhere,
          {
            OR: [
              { division: { in: deptCandidates } },
              { feedbackDept: { in: deptCandidates } },
              { respDept: { in: deptCandidates } },
            ],
          },
        ],
      };
    }

    // 售后可用 handler 做 SELF 过滤
    return {
      AND: [baseWhere, { handler: user.username || '' }],
    };
  },

  async buildWorkOrderWhere(
    baseWhere: Prisma.work_ordersWhereInput,
    user: UserContext,
  ): Promise<Prisma.work_ordersWhereInput> {
    const { scopeType, deptIds } = await resolveScope(
      user.userId,
      'work-order',
    );
    if (scopeType === 'ALL') {
      return baseWhere;
    }

    const deptCandidates = await this.getDeptCandidates(deptIds);
    // 工单当前无稳定“责任人”字段，SELF 暂按部门口径兜底
    return {
      AND: [baseWhere, { division: { in: deptCandidates } }],
    };
  },
};
