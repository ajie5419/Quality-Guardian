import type { Prisma } from '@prisma/client';

import type {
  TeamIdentityCreateInput,
  TeamIdentityListQuery,
  TeamIdentityUpdateInput,
} from './team-identity.schema';

import { team_identity_merge_status } from '@prisma/client';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import {
  createTeamIdentity,
  normalizeDisplayName,
  normalizeOperator,
  normalizeWriteInput,
  teamNameCollision,
  updateTeamIdentity,
} from './team-identity-write';

const TEAM_DICT_TYPE = 'team';
const ACTIVE_STATUS = 1;
const RETIRED_STATUS = 0;
const logger = createModuleLogger('TeamIdentityService');

export interface TeamIdentity {
  id: string;
  name: string;
  remark: null | string;
  sort: number;
  status: number;
}

export interface TeamIdentityOption extends TeamIdentity {
  label: string;
  value: string;
}

function toTeamIdentity(team: {
  dictKey: string;
  id: string;
  remark: null | string;
  sort: number;
  status: number;
}): TeamIdentity {
  return {
    id: team.id,
    name: team.dictKey,
    remark: team.remark,
    sort: team.sort,
    status: team.status,
  };
}

async function findTeamNamesByIds(ids: string[]) {
  const names = new Map<string, string>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const teams = await prisma.dictionaries.findMany({
      where: {
        id: { in: ids.slice(offset, offset + 500) },
        dictType: TEAM_DICT_TYPE,
        isDeleted: false,
      },
      select: { dictKey: true, id: true },
    });
    for (const team of teams) names.set(team.id, team.dictKey);
  }
  return names;
}

async function retireActiveTeam(
  client: Prisma.TransactionClient,
  id: string,
  operator: string,
) {
  await SupplierIdentityService.lockTeamForMutation(id, client);
  const existing = await client.dictionaries.findFirst({
    where: {
      id,
      dictType: TEAM_DICT_TYPE,
      isDeleted: false,
      status: ACTIVE_STATUS,
    },
  });
  if (!existing) {
    throw new BusinessError(
      'TEAM_NOT_FOUND',
      'Active TEAM does not exist',
      404,
    );
  }
  if (existing.isSystem) {
    throw new BusinessError(
      'SYSTEM_TEAM',
      'System TEAM cannot be retired',
      403,
    );
  }
  await SupplierIdentityService.assertTeamCanBeRetired(id, client);
  const result = await client.dictionaries.updateMany({
    where: {
      id,
      updatedAt: existing.updatedAt,
      isDeleted: false,
      status: ACTIVE_STATUS,
    },
    data: { status: RETIRED_STATUS, updatedBy: operator },
  });
  if (result.count !== 1) {
    throw new BusinessError(
      'TEAM_CONCURRENT_UPDATE',
      'TEAM was modified concurrently',
      409,
    );
  }
}

export const TeamIdentityService = {
  async resolveById(teamId: null | string | undefined) {
    const id = String(teamId || '').trim();
    if (!id) return null;
    const team = await prisma.dictionaries.findFirst({
      where: {
        id,
        dictType: TEAM_DICT_TYPE,
        isDeleted: false,
        status: ACTIVE_STATUS,
      },
      select: {
        dictKey: true,
        id: true,
        remark: true,
        sort: true,
        status: true,
      },
    });
    if (!team) {
      throw new BusinessError('INVALID_TEAM_ID', 'Active TEAM does not exist');
    }
    return toTeamIdentity(team);
  },

  async resolveNamesByIds(teamIds: ReadonlyArray<null | string | undefined>) {
    const ids = [
      ...new Set(teamIds.map((id) => String(id || '').trim())),
    ].filter(Boolean);
    if (ids.length === 0) return new Map<string, string>();
    const canonicalById = await this.resolveCanonicalIds(ids);
    const names = await findTeamNamesByIds([
      ...new Set([...canonicalById.values(), ...ids]),
    ]);
    const namesById = new Map<string, string>();
    for (const id of new Set([...canonicalById.values(), ...ids])) {
      const canonicalId = canonicalById.get(id) ?? id;
      namesById.set(id, names.get(canonicalId) ?? '');
    }
    return namesById;
  },

  /**
   * Resolve legacy TEAM IDs to their canonical ID through completed merge
   * mappings. Historical rows keep their original IDs untouched; read paths
   * use this mapping so aggregation merges duplicates and names hydrate from
   * the canonical team.
   */
  async resolveCanonicalIds(teamIds: ReadonlyArray<null | string | undefined>) {
    const ids = [
      ...new Set(teamIds.map((id) => String(id || '').trim())),
    ].filter(Boolean);
    if (ids.length === 0) return new Map<string, string>();
    const merges = await prisma.team_identity_merges.findMany({
      where: {
        isDeleted: false,
        sourceTeamId: { in: ids },
        status: team_identity_merge_status.COMPLETED,
      },
      select: { sourceTeamId: true, targetTeamId: true },
    });
    const direct = new Map(
      merges.map((merge) => [merge.sourceTeamId, merge.targetTeamId]),
    );
    const canonicalById = new Map<string, string>();
    for (const id of ids) {
      let current = id;
      const seen = new Set<string>();
      while (direct.has(current) && !seen.has(current)) {
        seen.add(current);
        const next = direct.get(current);
        if (!next) break;
        current = next;
      }
      canonicalById.set(id, current);
    }
    return canonicalById;
  },

  async listOptions(params: TeamIdentityListQuery = {}) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 100, 1), 100);
    const keyword = normalizeDisplayName(params.keyword);
    const teams = await prisma.dictionaries.findMany({
      where: {
        dictType: TEAM_DICT_TYPE,
        isDeleted: false,
        status: ACTIVE_STATUS,
        ...(keyword ? { dictKey: { contains: keyword } } : {}),
      },
      orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        dictKey: true,
        id: true,
        remark: true,
        sort: true,
        status: true,
      },
    });
    return teams.map((team) => ({
      ...toTeamIdentity(team),
      label: team.dictKey,
      value: team.id,
    }));
  },

  async create(input: TeamIdentityCreateInput, operator: string) {
    const normalized = normalizeWriteInput(input.name, operator);
    try {
      const team = await prisma.$transaction((client) =>
        createTeamIdentity(client, input, normalized),
      );
      return toTeamIdentity(team);
    } catch (error: unknown) {
      logger.error(
        { err: error, nameKey: normalized.nameKey },
        'failed to create TEAM',
      );
      if (isPrismaUniqueConstraintError(error)) throw teamNameCollision();
      throw error;
    }
  },

  async update(
    teamId: string,
    input: TeamIdentityUpdateInput,
    operator: string,
  ) {
    const id = String(teamId || '').trim();
    const actor = normalizeOperator(operator);
    try {
      const team = await prisma.$transaction(async (client) => {
        await SupplierIdentityService.lockTeamForMutation(id, client);
        return updateTeamIdentity(client, id, input, actor);
      });
      return toTeamIdentity(team);
    } catch (error: unknown) {
      logger.error({ err: error, teamId: id }, 'failed to update TEAM');
      if (isPrismaUniqueConstraintError(error)) throw teamNameCollision();
      throw error;
    }
  },

  async retire(teamId: string, operator: string) {
    const id = String(teamId || '').trim();
    const actor = normalizeOperator(operator);
    try {
      await prisma.$transaction((tx) => retireActiveTeam(tx, id, actor));
    } catch (error: unknown) {
      logger.error({ err: error, teamId: id }, 'failed to retire TEAM');
      throw error;
    }
  },
};
