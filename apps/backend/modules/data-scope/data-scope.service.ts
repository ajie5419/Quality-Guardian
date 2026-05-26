import { Prisma } from '@prisma/client';
import { getDataScopeConfig } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { isDataScopeV2Enabled } from '~/utils/rbac-config';

type DataScopeType = 'ALL' | 'DEPT' | 'SELF';

interface UserContext {
  userId: string;
  username?: string;
}

type ScopedWhere = Record<string, unknown> & {
  AND?: unknown[];
};

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
  module: string,
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

function buildFieldFilter(
  fields: string[],
  valueBuilder: (field: string) => unknown,
) {
  const filters = fields.map((field) => ({ [field]: valueBuilder(field) }));
  if (filters.length === 1) {
    return filters[0];
  }
  return { OR: filters };
}

function combineWhere<T extends ScopedWhere>(
  baseWhere: T,
  filter: Record<string, unknown>,
): T {
  return {
    AND: [baseWhere, filter],
  } as T;
}

export const DataScopeService = {
  async getScopeForModule(userId: string, module: string) {
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

  async buildScopedWhere<T extends ScopedWhere>(
    module: string,
    baseWhere: T,
    user: UserContext,
  ): Promise<T> {
    const config = getDataScopeConfig(module);
    if (!config) {
      return baseWhere;
    }

    const { scopeType, deptIds } = await resolveScope(user.userId, module);

    if (scopeType === 'ALL') {
      return baseWhere;
    }

    if (scopeType === 'DEPT') {
      const deptCandidates = await this.getDeptCandidates(deptIds);

      return combineWhere(
        baseWhere,
        buildFieldFilter(config.deptFields, () => ({ in: deptCandidates })),
      );
    }

    if (config.selfFallsBackToDept) {
      const deptCandidates = await this.getDeptCandidates(deptIds);
      if (deptCandidates.length === 0) {
        return baseWhere;
      }

      return combineWhere(
        baseWhere,
        buildFieldFilter(config.deptFields, () => ({ in: deptCandidates })),
      );
    }

    return combineWhere(
      baseWhere,
      buildFieldFilter(config.selfFields, () => user.username || ''),
    );
  },

  async buildInspectionWhere(
    baseWhere: Prisma.quality_recordsWhereInput,
    user: UserContext,
  ): Promise<Prisma.quality_recordsWhereInput> {
    return this.buildScopedWhere('inspection', baseWhere, user);
  },

  async buildSupplierWhere(
    baseWhere: Prisma.suppliersWhereInput,
    user: UserContext,
  ): Promise<Prisma.suppliersWhereInput> {
    return this.buildScopedWhere('supplier', baseWhere, user);
  },

  async buildAfterSalesWhere(
    baseWhere: Prisma.after_salesWhereInput,
    user: UserContext,
  ): Promise<Prisma.after_salesWhereInput> {
    return this.buildScopedWhere('after-sales', baseWhere, user);
  },

  async buildWorkOrderWhere(
    baseWhere: Prisma.work_ordersWhereInput,
    user: UserContext,
  ): Promise<Prisma.work_ordersWhereInput> {
    return this.buildScopedWhere('work-order', baseWhere, user);
  },
};
