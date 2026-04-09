import prisma from '~/utils/prisma';

const WELDER_SCORE_MAX = 12;
const WELDER_SCORE_MIN = 0;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();
}

function resolveSeverityDeduction(severity: unknown): number {
  const value = normalizeText(severity);
  if (!value) return 1;
  if (value === 'critical' || value === '严重') return 4;
  if (value === 'major' || value === '一般' || value === '中等') return 2;
  return 1;
}

function clampWelderScore(value: number): number {
  return Math.max(WELDER_SCORE_MIN, Math.min(WELDER_SCORE_MAX, value));
}

function addIndexItem(
  map: Map<string, string[]>,
  key: string,
  welderId: string,
): void {
  if (!key) return;
  const existing = map.get(key) || [];
  if (!existing.includes(welderId)) {
    existing.push(welderId);
  }
  map.set(key, existing);
}

function resolveSingleMatch(
  map: Map<string, string[]>,
  key: string,
): string | undefined {
  const candidates = map.get(key) || [];
  if (candidates.length !== 1) return undefined;
  return candidates[0];
}

function buildTokenCandidates(rawText: string): string[] {
  const parts = rawText
    .split(/[\s,，、;；/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const part of parts) {
    const normalized = normalizeText(part);
    if (normalized) tokens.add(normalized);
    const stripped = normalizeText(
      part
        .replaceAll('(', '')
        .replaceAll(')', '')
        .replaceAll('（', '')
        .replaceAll('）', '')
        .replaceAll('【', '')
        .replaceAll('】', '')
        .replaceAll('[', '')
        .replaceAll(']', ''),
    );
    if (stripped) tokens.add(stripped);
  }
  return [...tokens];
}

function resolveByContainMatch(
  rawText: string,
  entries: Array<[string, string[]]>,
): string | undefined {
  const matchedIds = new Set<string>();
  for (const [key, ids] of entries) {
    if (!key) continue;
    if (!rawText.includes(key)) continue;
    if (ids.length !== 1) continue;
    matchedIds.add(ids[0]);
  }

  if (matchedIds.size !== 1) return undefined;
  return [...matchedIds][0];
}

function resolveResponsibleWelderId(
  responsibleWelder: unknown,
  codeIndex: Map<string, string[]>,
  nameIndex: Map<string, string[]>,
): string | undefined {
  const rawText = normalizeText(responsibleWelder);
  if (!rawText) return undefined;

  const exactByCode = resolveSingleMatch(codeIndex, rawText);
  if (exactByCode) return exactByCode;
  const exactByName = resolveSingleMatch(nameIndex, rawText);
  if (exactByName) return exactByName;

  for (const token of buildTokenCandidates(rawText)) {
    const byCode = resolveSingleMatch(codeIndex, token);
    if (byCode) return byCode;
    const byName = resolveSingleMatch(nameIndex, token);
    if (byName) return byName;
  }

  const byCodeContain = resolveByContainMatch(rawText, [
    ...codeIndex.entries(),
  ]);
  if (byCodeContain) return byCodeContain;
  return resolveByContainMatch(rawText, [...nameIndex.entries()]);
}

export const WelderScoreService = {
  async syncFromInspectionIssues(): Promise<{
    deductionIssueCount: number;
    matchedIssueCount: number;
    updatedCount: number;
  }> {
    const [welders, issues] = await Promise.all([
      prisma.welders.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          score: true,
          welderCode: true,
        },
      }),
      prisma.quality_records.findMany({
        where: {
          isDeleted: false,
          responsibleWelder: {
            not: null,
          },
        },
        select: {
          id: true,
          responsibleWelder: true,
          severity: true,
        },
      }),
    ]);

    if (welders.length === 0) {
      return {
        deductionIssueCount: issues.length,
        matchedIssueCount: 0,
        updatedCount: 0,
      };
    }

    const codeIndex = new Map<string, string[]>();
    const nameIndex = new Map<string, string[]>();
    for (const welder of welders) {
      addIndexItem(codeIndex, normalizeText(welder.welderCode), welder.id);
      addIndexItem(nameIndex, normalizeText(welder.name), welder.id);
    }

    const deductionByWelder = new Map<string, number>();
    let matchedIssueCount = 0;
    for (const issue of issues) {
      const welderId = resolveResponsibleWelderId(
        issue.responsibleWelder,
        codeIndex,
        nameIndex,
      );
      if (!welderId) continue;
      matchedIssueCount++;
      const current = deductionByWelder.get(welderId) || 0;
      deductionByWelder.set(
        welderId,
        current + resolveSeverityDeduction(issue.severity),
      );
    }

    const updateOps: Array<ReturnType<typeof prisma.welders.update>> = [];
    for (const welder of welders) {
      const deduction = deductionByWelder.get(welder.id) || 0;
      const nextScore = clampWelderScore(WELDER_SCORE_MAX - deduction);
      const currentScore = Number.isFinite(welder.score)
        ? Number(welder.score)
        : WELDER_SCORE_MAX;
      if (currentScore === nextScore) continue;
      updateOps.push(
        prisma.welders.update({
          where: { id: welder.id },
          data: {
            score: nextScore,
            updatedAt: new Date(),
          },
        }),
      );
    }

    if (updateOps.length > 0) {
      await prisma.$transaction(updateOps);
    }

    return {
      deductionIssueCount: issues.length,
      matchedIssueCount,
      updatedCount: updateOps.length,
    };
  },
};
