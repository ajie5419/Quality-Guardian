import process from 'node:process';

import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';
import { createModuleLogger } from '~/utils/logger';

type CacheEntry = {
  expiresAt: number;
  teamId: null | string;
};

const TEAM_ID_CACHE_TTL_MS = 5 * 60 * 1000;
const TEAM_GOVERNANCE_FAILOVER_ENABLED =
  process.env.TEAM_GOVERNANCE_FAILOVER_ENABLED !== 'false';
const TEAM_GOVERNANCE_FAILOVER_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.TEAM_GOVERNANCE_FAILOVER_COOLDOWN_MS || 30_000),
);
const teamIdCache = new Map<string, CacheEntry>();
const logger = createModuleLogger('TeamResolver');
let teamGovernanceFailoverUntil = 0;

function normalizeTeamName(team: unknown) {
  return String(team || '').trim();
}

function shouldBypassGovernanceLookup() {
  if (!TEAM_GOVERNANCE_FAILOVER_ENABLED) {
    return false;
  }
  return Date.now() < teamGovernanceFailoverUntil;
}

function markGovernanceLookupFailure(error: unknown, operation: string) {
  if (!TEAM_GOVERNANCE_FAILOVER_ENABLED) {
    return;
  }
  teamGovernanceFailoverUntil =
    Date.now() + TEAM_GOVERNANCE_FAILOVER_COOLDOWN_MS;
  logger.warn(
    {
      operation,
      cooldownMs: TEAM_GOVERNANCE_FAILOVER_COOLDOWN_MS,
      error: error instanceof Error ? error.message : String(error),
      failoverUntil: teamGovernanceFailoverUntil,
    },
    'team governance lookup failed, fallback mode enabled',
  );
}

function markGovernanceLookupSuccess() {
  if (!TEAM_GOVERNANCE_FAILOVER_ENABLED) {
    return;
  }
  teamGovernanceFailoverUntil = 0;
}

function resolveTeamIdForWriteFallback(options: {
  explicitTeamId?: null | string;
  fallbackTeamId?: null | string;
  keepExistingWhenNameMissing?: boolean;
  team?: null | string;
}): null | string | undefined {
  if (options.explicitTeamId !== undefined) {
    return options.explicitTeamId;
  }
  const normalizedTeam = normalizeTeamName(options.team);
  if (!normalizedTeam) {
    if (options.keepExistingWhenNameMissing) {
      return undefined;
    }
    return options.fallbackTeamId ?? null;
  }
  return options.fallbackTeamId ?? null;
}

export async function resolveTeamIdsByNames(
  teams: Array<null | string | undefined>,
) {
  const normalizedTeams = [
    ...new Set(teams.map((item) => normalizeTeamName(item)).filter(Boolean)),
  ];
  const resolvedMap = new Map<string, null | string>();
  if (normalizedTeams.length === 0) {
    return resolvedMap;
  }

  const now = Date.now();
  const pendingTeams: string[] = [];
  for (const team of normalizedTeams) {
    const cached = teamIdCache.get(team);
    if (cached && cached.expiresAt > now) {
      resolvedMap.set(team, cached.teamId);
      continue;
    }
    pendingTeams.push(team);
  }

  if (pendingTeams.length > 0) {
    let teamIdByName = new Map<string, null | string>();
    if (!shouldBypassGovernanceLookup()) {
      try {
        teamIdByName =
          await MasterDataGovernanceKernel.resolveCanonicalIdsByNames({
            configKey: 'team',
            names: pendingTeams,
          });
        markGovernanceLookupSuccess();
      } catch (error) {
        markGovernanceLookupFailure(error, 'resolveTeamIdsByNames');
        teamIdByName = new Map<string, null | string>();
      }
    }
    for (const team of pendingTeams) {
      const teamId = teamIdByName.get(team) || null;
      teamIdCache.set(team, {
        teamId,
        expiresAt: now + TEAM_ID_CACHE_TTL_MS,
      });
      resolvedMap.set(team, teamId);
    }
  }

  return resolvedMap;
}

export async function resolveTeamIdForWrite(options: {
  explicitTeamId?: null | string;
  fallbackTeamId?: null | string;
  keepExistingWhenNameMissing?: boolean;
  team?: null | string;
}): Promise<null | string | undefined> {
  if (shouldBypassGovernanceLookup()) {
    return resolveTeamIdForWriteFallback(options);
  }
  try {
    const teamId = await MasterDataGovernanceKernel.resolveCanonicalIdForWrite({
      configKey: 'team',
      explicitCanonicalId: options.explicitTeamId,
      fallbackCanonicalId: options.fallbackTeamId,
      keepExistingWhenNameMissing: options.keepExistingWhenNameMissing,
      name: options.team,
    });
    markGovernanceLookupSuccess();
    return teamId;
  } catch (error) {
    markGovernanceLookupFailure(error, 'resolveTeamIdForWrite');
    return resolveTeamIdForWriteFallback(options);
  }
}

export async function buildTeamContainsWhere(options: {
  canonicalIdField?: string;
  field?: string;
  keyword: string;
}) {
  const field = String(options.field || '').trim() || 'team';
  const canonicalIdField =
    String(options.canonicalIdField || '').trim() || 'teamId';
  const keyword = normalizeTeamName(options.keyword);
  if (!keyword) {
    return {};
  }
  const resolvedTeamId = await resolveTeamIdForWrite({
    team: keyword,
  });
  const containsCondition = {
    [field]: { contains: keyword },
  } as Record<string, unknown>;
  if (!resolvedTeamId) {
    return containsCondition;
  }
  return {
    OR: [containsCondition, { [canonicalIdField]: resolvedTeamId }],
  };
}

export function __resetTeamResolverRuntimeForTest() {
  teamIdCache.clear();
  teamGovernanceFailoverUntil = 0;
}
