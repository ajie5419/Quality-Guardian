import type { Prisma } from '@prisma/client';

import type {
  TeamIdentityCreateInput,
  TeamIdentityUpdateInput,
} from './team-identity.schema';

import {
  team_identity_alias_kind,
  team_identity_source_type,
} from '@prisma/client';
import { BusinessError } from '~/utils/business-error';

const TEAM_DICT_TYPE = 'team';
const ACTIVE_STATUS = 1;
const LEGACY_SCAN_BATCH_SIZE = 100;
const NAME_SEPARATOR_PATTERN =
  /[\s\-\u2010-\u2015_./\\\u00B7\u2022\u30FB:\uFF1A]+/gu;

type TeamClient = Pick<
  Prisma.TransactionClient,
  | 'dictionaries'
  | 'team_identity_aliases'
  | 'team_identity_name_keys'
  | 'team_identity_sources'
>;

export function normalizeDisplayName(value: unknown) {
  return String(value || '').trim();
}

export function normalizeOperator(value: unknown) {
  const operator = String(value || '').trim();
  if (!operator) throw new BusinessError('VALIDATION', 'Operator is required');
  return operator;
}

export function buildTeamIdentityNameKey(name: string) {
  const key = name
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(NAME_SEPARATOR_PATTERN, '');
  if (!key)
    throw new BusinessError('INVALID_TEAM_NAME', 'TEAM name is invalid');
  return key;
}

export function teamNameCollision() {
  return new BusinessError(
    'TEAM_NAME_COLLISION',
    'TEAM name conflicts with an existing identity or alias',
    409,
  );
}

export function normalizeWriteInput(name: unknown, operator: unknown) {
  const normalizedName = normalizeDisplayName(name);
  const normalizedOperator = normalizeOperator(operator);
  if (!normalizedName) {
    throw new BusinessError('INVALID_TEAM_NAME', 'TEAM name is required');
  }
  return {
    name: normalizedName,
    nameKey: buildTeamIdentityNameKey(normalizedName),
    operator: normalizedOperator,
  };
}

async function findLegacyCollision(
  client: TeamClient,
  nameKey: string,
  excludedTeamId?: string,
) {
  let cursor: string | undefined;
  while (true) {
    const teams = await client.dictionaries.findMany({
      where: {
        dictType: TEAM_DICT_TYPE,
        isDeleted: false,
        status: ACTIVE_STATUS,
        ...(excludedTeamId ? { id: { not: excludedTeamId } } : {}),
      },
      orderBy: { id: 'asc' },
      select: { dictKey: true, id: true },
      take: LEGACY_SCAN_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const collision = teams.find(
      (team) => buildTeamIdentityNameKey(team.dictKey) === nameKey,
    );
    if (collision || teams.length < LEGACY_SCAN_BATCH_SIZE) return collision;
    cursor = teams.at(-1)?.id;
  }
}

async function assertNameAvailable(
  client: TeamClient,
  nameKey: string,
  excludedTeamId?: string,
) {
  const keyOwner = await client.team_identity_name_keys.findUnique({
    where: { nameKey },
    select: { teamId: true },
  });
  if (keyOwner && keyOwner.teamId !== excludedTeamId) {
    throw teamNameCollision();
  }
  if (await findLegacyCollision(client, nameKey, excludedTeamId)) {
    throw teamNameCollision();
  }
}

async function upsertOwnedAlias(
  client: TeamClient,
  teamId: string,
  alias: string,
  aliasKind: team_identity_alias_kind,
  operator: string,
) {
  const nameKey = buildTeamIdentityNameKey(alias);
  const existing = await client.team_identity_aliases.findFirst({
    where: { isDeleted: false, nameKey, teamId },
  });
  if (existing) {
    await client.team_identity_aliases.update({
      where: { id: existing.id },
      data: { alias, aliasKind, nameKey },
    });
    return;
  }
  await client.team_identity_aliases.create({
    data: { alias, aliasKind, createdBy: operator, nameKey, teamId },
  });
}

async function claimNameKey(
  client: TeamClient,
  nameKey: string,
  teamId: string,
  operator: string,
) {
  const existing = await client.team_identity_name_keys.findUnique({
    where: { nameKey },
  });
  if (existing?.teamId === teamId) return;
  if (existing) throw teamNameCollision();
  await client.team_identity_name_keys.create({
    data: { createdBy: operator, nameKey, teamId },
  });
}

async function syncAliasesForRename(
  client: TeamClient,
  team: { dictKey: string; id: string },
  name: string,
  operator: string,
) {
  if (
    buildTeamIdentityNameKey(team.dictKey) !== buildTeamIdentityNameKey(name)
  ) {
    await upsertOwnedAlias(
      client,
      team.id,
      team.dictKey,
      team_identity_alias_kind.HISTORICAL,
      operator,
    );
  }
  await client.team_identity_aliases.updateMany({
    where: {
      teamId: team.id,
      aliasKind: team_identity_alias_kind.CANONICAL,
      isDeleted: false,
    },
    data: { aliasKind: team_identity_alias_kind.HISTORICAL },
  });
  await upsertOwnedAlias(
    client,
    team.id,
    name,
    team_identity_alias_kind.CANONICAL,
    operator,
  );
}

export async function createTeamIdentity(
  client: TeamClient,
  input: TeamIdentityCreateInput,
  normalized: ReturnType<typeof normalizeWriteInput>,
) {
  await assertNameAvailable(client, normalized.nameKey);
  const team = await client.dictionaries.create({
    data: {
      createdBy: normalized.operator,
      dictKey: normalized.name,
      dictType: TEAM_DICT_TYPE,
      dictValue: normalized.name,
      isDeleted: false,
      isSystem: false,
      remark: normalizeDisplayName(input.remark) || null,
      sort: input.sort ?? 0,
      status: ACTIVE_STATUS,
      updatedBy: normalized.operator,
    },
  });
  await claimNameKey(client, normalized.nameKey, team.id, normalized.operator);
  await client.team_identity_aliases.create({
    data: {
      alias: normalized.name,
      aliasKind: team_identity_alias_kind.CANONICAL,
      createdBy: normalized.operator,
      nameKey: normalized.nameKey,
      teamId: team.id,
    },
  });
  await client.team_identity_sources.create({
    data: {
      createdBy: normalized.operator,
      sourceId: team.id,
      sourceNameSnapshot: normalized.name,
      sourceType: team_identity_source_type.MANUAL,
      teamId: team.id,
    },
  });
  return team;
}

async function loadActiveTeam(client: TeamClient, id: string) {
  const team = await client.dictionaries.findFirst({
    where: {
      id,
      dictType: TEAM_DICT_TYPE,
      isDeleted: false,
      status: ACTIVE_STATUS,
    },
  });
  if (!team) {
    throw new BusinessError(
      'TEAM_NOT_FOUND',
      'Active TEAM does not exist',
      404,
    );
  }
  return team;
}

async function updateTeamRow(
  client: TeamClient,
  team: Awaited<ReturnType<typeof loadActiveTeam>>,
  input: TeamIdentityUpdateInput,
  name: string,
  operator: string,
) {
  const result = await client.dictionaries.updateMany({
    where: {
      id: team.id,
      updatedAt: team.updatedAt,
      isDeleted: false,
      status: ACTIVE_STATUS,
    },
    data: {
      dictKey: name,
      dictValue: name,
      ...(input.remark === undefined
        ? {}
        : { remark: normalizeDisplayName(input.remark) || null }),
      ...(input.sort === undefined ? {} : { sort: input.sort }),
      updatedBy: operator,
    },
  });
  if (result.count !== 1) {
    throw new BusinessError(
      'TEAM_CONCURRENT_UPDATE',
      'TEAM was modified concurrently',
      409,
    );
  }
}

export async function updateTeamIdentity(
  client: TeamClient,
  id: string,
  input: TeamIdentityUpdateInput,
  operator: string,
) {
  const existing = await loadActiveTeam(client, id);
  const name =
    input.name === undefined
      ? existing.dictKey
      : normalizeDisplayName(input.name);
  if (input.name !== undefined) {
    const nameKey = buildTeamIdentityNameKey(name);
    await assertNameAvailable(client, nameKey, id);
    await claimNameKey(client, nameKey, id, operator);
  }
  await updateTeamRow(client, existing, input, name, operator);
  if (input.name !== undefined) {
    await syncAliasesForRename(client, existing, name, operator);
  }
  const updated = await client.dictionaries.findFirst({
    where: { id, isDeleted: false },
  });
  if (!updated) {
    throw new BusinessError('TEAM_NOT_FOUND', 'TEAM does not exist', 404);
  }
  return updated;
}
