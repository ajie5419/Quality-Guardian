import type { QmsModuleContext, QmsModuleDefinition } from './types';

import { MasterDataGovernanceKernel } from '~/core/master-data/governance-kernel';

function normalizeModuleString(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = String(value).trim();
  return normalized || undefined;
}

function withSoftDelete(
  where: Record<string, unknown>,
  softDelete: boolean,
): Record<string, unknown> {
  if (!softDelete) {
    return where;
  }
  if (Object.keys(where).length === 0) {
    return { isDeleted: false };
  }
  return {
    AND: [where, { isDeleted: false }],
  };
}

async function applyGovernedFields(
  payload: Record<string, unknown>,
  definition: QmsModuleDefinition,
) {
  if (!definition.governedFields?.length) {
    return payload;
  }

  const output = { ...payload };
  for (const field of definition.governedFields) {
    const value = normalizeModuleString(output[field.field]);
    if (!value || !field.idField) {
      continue;
    }
    const resolved =
      await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
        configKey: field.configKey,
        names: [value],
      });
    output[field.idField] = resolved.get(value) || null;
  }
  return output;
}

export function createModuleService(definition: QmsModuleDefinition) {
  return {
    async create(payload: unknown, _ctx: QmsModuleContext = {}) {
      const data = await applyGovernedFields(
        definition.schemas.create.parse(payload),
        definition,
      );
      if (definition.workflow?.initialState && data.status === undefined) {
        data.status = definition.workflow.initialState;
      }
      return definition.prismaDelegate.create({ data });
    },

    async delete(id: string) {
      if (!definition.prismaDelegate.delete) {
        throw new Error(`Delete is not supported for ${definition.name}`);
      }
      return definition.prismaDelegate.delete({ where: { id } });
    },

    async getById(id: string) {
      if (definition.prismaDelegate.findUnique) {
        return definition.prismaDelegate.findUnique({ where: { id } });
      }
      if (definition.prismaDelegate.findFirst) {
        return definition.prismaDelegate.findFirst({
          where: { id },
        });
      }
      throw new Error(`Read is not supported for ${definition.name}`);
    },

    async list(params: unknown, ctx: QmsModuleContext = {}) {
      const input = definition.schemas.list.parse(params);
      const baseWhere = definition.whereBuilder
        ? await definition.whereBuilder(input, ctx)
        : {};
      const scopedWhere =
        definition.dataScope.applyWhere &&
        definition.dataScope.strategy !== 'none'
          ? await definition.dataScope.applyWhere(baseWhere, ctx)
          : baseWhere;
      const where = withSoftDelete(scopedWhere, definition.softDelete);
      const [items, total] = await Promise.all([
        definition.prismaDelegate.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        }),
        definition.prismaDelegate.count({ where }),
      ]);
      return {
        items,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? (Array.isArray(items) ? items.length : 0),
        total,
      };
    },

    async update(id: string, payload: unknown, _ctx: QmsModuleContext = {}) {
      const data = await applyGovernedFields(
        definition.schemas.update.parse(payload),
        definition,
      );
      return definition.prismaDelegate.update({ data, where: { id } });
    },
  };
}
