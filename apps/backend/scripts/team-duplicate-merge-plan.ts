import { buildTeamIdentityNameKey } from '~/modules/team/team-identity-write';

export interface DuplicateMergePlanTeam {
  id: string;
  name: string;
  sourceKeys: string[];
  status: number;
}

export interface DepartmentLeaf {
  id: string;
  name: string;
}

export interface ConfirmedDuplicateMerge {
  evidence: 'business-confirmed' | 'department-leaf-name' | 'source-link';
  reason: string;
  sourceName: string;
  sourceTeamId: string;
  targetName: string;
  targetTeamId: string;
}

export interface BusinessMergeRule {
  sourceName: string;
  targetName: string;
  reason: string;
}

function selectCanonical(
  group: DuplicateMergePlanTeam[],
  leafNames: ReadonlySet<string>,
): null | {
  evidence: ConfirmedDuplicateMerge['evidence'];
  target: DuplicateMergePlanTeam;
} {
  const byLeaf = group.filter((team) => leafNames.has(team.name));
  const withSource = group.filter((team) => team.sourceKeys.length > 0);
  const [leafCandidate] = byLeaf;
  const [sourceCandidate] = withSource;
  if (byLeaf.length === 1 && withSource.length === 0 && leafCandidate) {
    return { evidence: 'department-leaf-name', target: leafCandidate };
  }
  if (
    byLeaf.length === 1 &&
    withSource.length === 1 &&
    leafCandidate &&
    sourceCandidate &&
    leafCandidate.id === sourceCandidate.id
  ) {
    return { evidence: 'department-leaf-name', target: leafCandidate };
  }
  if (byLeaf.length === 0 && withSource.length === 1 && sourceCandidate) {
    return { evidence: 'source-link', target: sourceCandidate };
  }
  // Ambiguous canonical or conflicting evidence: keep for manual review.
  return null;
}

/**
 * Business-confirmed legacy name variants that must collapse onto a canonical
 * TEAM. The department tree only contains the BU leaves; the workshop names
 * are historical leftovers and were validated with business owners.
 */
export const CONFIRMED_TEAM_MERGE_RULES: BusinessMergeRule[] = [
  {
    sourceName: '机加车间',
    targetName: '机加 BU',
    reason:
      'Business-confirmed record-only merge: workshop name is a legacy variant of the BU team',
  },
  {
    sourceName: '模具车间',
    targetName: '模具 BU',
    reason:
      'Business-confirmed record-only merge: workshop name is a legacy variant of the BU team',
  },
  {
    sourceName: '组装车间',
    targetName: '组装 BU',
    reason:
      'Business-confirmed record-only merge: workshop name is a legacy variant of the BU team',
  },
];

/**
 * Plan record-only merges for active teams that share a normalized name key.
 * A canonical is chosen only with source evidence: an exact active department
 * leaf name match or an existing live source link. Business-confirmed legacy
 * variants (see CONFIRMED_TEAM_MERGE_RULES) are also planned when both teams
 * exist exactly once. Without evidence the group is left to the manual
 * disposition queue — name similarity alone never establishes identity
 * ownership.
 */
export function planConfirmedDuplicateMerges(
  teams: DuplicateMergePlanTeam[],
  departmentLeaves: DepartmentLeaf[],
): ConfirmedDuplicateMerge[] {
  const active = teams.filter((team) => team.status === 1);
  const leafNames = new Set(departmentLeaves.map((leaf) => leaf.name));
  const plans: ConfirmedDuplicateMerge[] = [];

  // Normalized-name duplicates: whitespace/punctuation variants that share a
  // name key. The canonical must be unambiguous; conflicting leaf and source
  // evidence keeps the whole group for manual review.
  const groups = new Map<string, DuplicateMergePlanTeam[]>();
  for (const team of active) {
    const key = buildTeamIdentityNameKey(team.name);
    const group = groups.get(key) || [];
    group.push(team);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const selection = selectCanonical(group, leafNames);
    if (!selection) continue;
    for (const source of group) {
      if (source.id === selection.target.id) continue;
      plans.push({
        evidence: selection.evidence,
        reason: `Automated record-only merge: ${source.name} -> ${selection.target.name} (evidence: ${selection.evidence})`,
        sourceName: source.name,
        sourceTeamId: source.id,
        targetName: selection.target.name,
        targetTeamId: selection.target.id,
      });
    }
  }

  // Business-confirmed legacy variants whose names differ, so they never share
  // a name key. A rule only fires when both teams exist exactly once.
  const activeByName = new Map<string, DuplicateMergePlanTeam[]>();
  for (const team of active) {
    const list = activeByName.get(team.name) || [];
    list.push(team);
    activeByName.set(team.name, list);
  }
  for (const rule of CONFIRMED_TEAM_MERGE_RULES) {
    const sources = activeByName.get(rule.sourceName) || [];
    const targets = activeByName.get(rule.targetName) || [];
    const [source] = sources;
    const [target] = targets;
    if (!source || !target) continue;
    if (sources.length !== 1 || targets.length !== 1) continue;
    if (source.id === target.id) continue;
    plans.push({
      evidence: 'business-confirmed',
      reason: rule.reason,
      sourceName: source.name,
      sourceTeamId: source.id,
      targetName: target.name,
      targetTeamId: target.id,
    });
  }

  return plans.sort((left, right) =>
    left.sourceTeamId.localeCompare(right.sourceTeamId),
  );
}
