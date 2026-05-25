const WELDER_SCORE_MAX = 12;
const WELDER_SCORE_MIN = 0;

function normalizeWelderScoreText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replaceAll(/\s+/g, ' ')
    .toLowerCase();
}

export function resolveWelderSeverityDeduction(severity: unknown): number {
  const value = normalizeWelderScoreText(severity);
  if (!value) return 1;
  if (value === 'critical' || value === '严重') return 4;
  if (value === 'major' || value === '一般' || value === '中等') return 2;
  return 1;
}

export function clampWelderScore(value: number): number {
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
    const normalized = normalizeWelderScoreText(part);
    if (normalized) tokens.add(normalized);
    const stripped = normalizeWelderScoreText(
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

export function resolveWelderIdByResponsibleText(params: {
  responsibleWelder: unknown;
  welderCandidates: Array<{
    id: string;
    name?: null | string;
    welderCode?: null | string;
  }>;
}): string | undefined {
  const rawText = normalizeWelderScoreText(params.responsibleWelder);
  if (!rawText) return undefined;

  const codeIndex = new Map<string, string[]>();
  const nameIndex = new Map<string, string[]>();
  for (const welder of params.welderCandidates) {
    addIndexItem(
      codeIndex,
      normalizeWelderScoreText(welder.welderCode),
      welder.id,
    );
    addIndexItem(nameIndex, normalizeWelderScoreText(welder.name), welder.id);
  }

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
