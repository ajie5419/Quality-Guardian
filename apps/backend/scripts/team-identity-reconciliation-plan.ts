import type { team_identity_source_type } from '@prisma/client';

import { buildTeamIdentityNameKey } from '~/modules/team/team-identity-write';

export interface TeamSourceCandidate {
  name: string;
  sort: number;
  sourceId: string;
  sourceType: Extract<team_identity_source_type, 'DEPARTMENT' | 'SUPPLIER'>;
}

export interface ReconciliationTeam {
  id: string;
  name: string;
  status: number;
}

export interface ReconciliationSource {
  isDeleted: boolean;
  sourceId: string;
  sourceType: team_identity_source_type;
  teamId: string;
}

export interface AmbiguousTeamGroup {
  evidenceTeamIds: string[];
  nameKey: string;
  teamIds: string[];
}

export function sourceKey(source: {
  sourceId: string;
  sourceType: team_identity_source_type;
}) {
  return `${source.sourceType}:${source.sourceId}`;
}

export function chooseTeamForSource(
  candidate: TeamSourceCandidate,
  teams: ReconciliationTeam[],
  sources: ReconciliationSource[],
  legacyClaims: ReadonlyMap<string, string[]>,
) {
  const activeTeams = teams.filter((team) => team.status === 1);
  const activeIds = new Set(activeTeams.map((team) => team.id));
  const linked = sources.find(
    (source) => !source.isDeleted && sourceKey(source) === sourceKey(candidate),
  );
  if (linked && activeIds.has(linked.teamId)) {
    return { action: 'link' as const, teamId: linked.teamId };
  }
  const claimedIds = (legacyClaims.get(sourceKey(candidate)) || []).filter(
    (teamId) => activeIds.has(teamId),
  );
  if (claimedIds.length === 1) {
    return { action: 'link' as const, teamId: claimedIds[0] as string };
  }
  if (claimedIds.length > 1) {
    return { action: 'ambiguous' as const, teamIds: claimedIds };
  }
  const exact = activeTeams.filter((team) => team.name === candidate.name);
  const normalized = activeTeams.filter(
    (team) =>
      buildTeamIdentityNameKey(team.name) ===
      buildTeamIdentityNameKey(candidate.name),
  );
  const candidates = exact.length > 0 ? exact : normalized;
  if (candidates.length > 0) {
    return {
      action: 'ambiguous' as const,
      teamIds: candidates.map((team) => team.id).sort(),
    };
  }
  return { action: 'create' as const };
}

export function findAmbiguousTeamGroups(
  teams: ReconciliationTeam[],
  sources: ReconciliationSource[],
  supplierLinkedTeamIds: ReadonlySet<string>,
) {
  const groups = new Map<string, ReconciliationTeam[]>();
  for (const team of teams) {
    if (team.status !== 1) continue;
    const nameKey = buildTeamIdentityNameKey(team.name);
    const group = groups.get(nameKey) || [];
    group.push(team);
    groups.set(nameKey, group);
  }
  const ambiguous: AmbiguousTeamGroup[] = [];
  for (const [nameKey, group] of groups) {
    if (group.length < 2) continue;
    const groupIds = new Set(group.map((team) => team.id));
    const evidenceIds = new Set(
      sources
        .filter((source) => !source.isDeleted && groupIds.has(source.teamId))
        .map((source) => source.teamId),
    );
    for (const teamId of supplierLinkedTeamIds) {
      if (groupIds.has(teamId)) evidenceIds.add(teamId);
    }
    ambiguous.push({
      evidenceTeamIds: [...evidenceIds].sort(),
      nameKey,
      teamIds: [...groupIds].sort(),
    });
  }
  return ambiguous;
}
