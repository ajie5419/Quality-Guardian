import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import prisma from '~/utils/prisma';

export type TeamDictionaryBootstrapMode = 'apply' | 'dry-run';

interface DepartmentSource {
  id: string;
  name: string;
  parentId: string;
  sort: number;
}

interface SupplierSource {
  category: null | string;
  id: string;
  name: string;
  outsourcingMode: null | string;
}

export interface TeamDictionaryCandidate {
  name: string;
  sort: number;
  sources: string[];
}

export interface TeamDictionaryBootstrapResult {
  candidates: number;
  created: number;
  existing: number;
  mode: TeamDictionaryBootstrapMode;
}

const TEAM_DICTIONARY_TYPE = 'team';
const BOOTSTRAP_OPERATOR = 'system:team-dictionary-bootstrap';
const SUPPLIER_SORT_OFFSET = 10_000;

function normalizeName(value: string) {
  return value.trim().replaceAll(/\s+/g, ' ');
}

function addCandidate(
  candidates: Map<string, TeamDictionaryCandidate>,
  input: { name: string; sort: number; source: string },
) {
  const name = normalizeName(input.name);
  if (!name) return;
  const existing = candidates.get(name);
  if (existing) {
    existing.sort = Math.min(existing.sort, input.sort);
    if (!existing.sources.includes(input.source)) {
      existing.sources.push(input.source);
      existing.sources.sort();
    }
    return;
  }
  candidates.set(name, {
    name,
    sort: input.sort,
    sources: [input.source],
  });
}

/**
 * Canonical TEAM entries are bootstrapped only from selectable legacy sources:
 * active department leaves and suppliers whose inspection policy uses TEAM IDs.
 */
export function collectTeamDictionaryCandidates(
  departments: DepartmentSource[],
  suppliers: SupplierSource[],
): TeamDictionaryCandidate[] {
  const candidates = new Map<string, TeamDictionaryCandidate>();
  const parentIds = new Set(departments.map((item) => item.parentId));

  for (const department of departments) {
    if (parentIds.has(department.id)) continue;
    addCandidate(candidates, {
      name: department.name,
      sort: department.sort,
      source: `department:${department.id}`,
    });
  }

  suppliers.forEach((supplier, index) => {
    if (resolveSupplierInspectionPolicy(supplier).identitySource !== 'team') {
      return;
    }
    addCandidate(candidates, {
      name: supplier.name,
      sort: SUPPLIER_SORT_OFFSET + index,
      source: `supplier:${supplier.id}`,
    });
  });

  return [...candidates.values()].sort(
    (left, right) =>
      left.sort - right.sort || left.name.localeCompare(right.name),
  );
}

export async function bootstrapTeamDictionaries(
  mode: TeamDictionaryBootstrapMode,
): Promise<TeamDictionaryBootstrapResult> {
  const [departments, suppliers, existingTeams] = await Promise.all([
    prisma.departments.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, parentId: true, sort: true },
    }),
    prisma.suppliers.findMany({
      where: { isDeleted: false },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: {
        category: true,
        id: true,
        name: true,
        outsourcingMode: true,
      },
    }),
    prisma.dictionaries.findMany({
      where: {
        dictType: TEAM_DICTIONARY_TYPE,
        isDeleted: false,
      },
      select: { dictKey: true },
    }),
  ]);
  const candidates = collectTeamDictionaryCandidates(departments, suppliers);
  const existingNames = new Set(
    existingTeams.map((item) => normalizeName(item.dictKey)),
  );
  const missing = candidates.filter((item) => !existingNames.has(item.name));
  let created = missing.length;

  if (mode === 'apply' && missing.length > 0) {
    const result = await prisma.dictionaries.createMany({
      data: missing.map((item) => ({
        createdBy: BOOTSTRAP_OPERATOR,
        dictKey: item.name,
        dictType: TEAM_DICTIONARY_TYPE,
        dictValue: item.name,
        isDeleted: false,
        isSystem: false,
        remark: JSON.stringify({
          managedBy: BOOTSTRAP_OPERATOR,
          sources: item.sources,
        }),
        sort: item.sort,
        status: 1,
        updatedBy: BOOTSTRAP_OPERATOR,
      })),
      skipDuplicates: true,
    });
    created = result.count;
  }

  return {
    candidates: candidates.length,
    created,
    existing: candidates.length - missing.length,
    mode,
  };
}
