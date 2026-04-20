export const PROCESS_PASS_RATE_TARGET_ORDER = [
  '外协结构',
  '外协机加',
  '外协涂装',
  '下料BU',
  '结构BU1',
  '结构BU2',
  '组装BU',
  '机加BU',
  '模具 BU',
] as const;

export type ProcessPassRateTargetKey =
  (typeof PROCESS_PASS_RATE_TARGET_ORDER)[number];

export const DEFAULT_PROCESS_PASS_RATE_TARGETS: Record<
  ProcessPassRateTargetKey,
  number
> = {
  外协结构: 99.85,
  外协机加: 99.9,
  外协涂装: 99.85,
  下料BU: 99.9,
  结构BU1: 99.85,
  结构BU2: 99.85,
  组装BU: 99.85,
  机加BU: 99.9,
  '模具 BU': 99.85,
};

const LEGACY_TARGET_MIGRATION_RULES: Array<{
  from: string[];
  to: ProcessPassRateTargetKey[];
}> = [
  {
    from: ['外协'],
    to: ['外协结构', '外协机加', '外协涂装'],
  },
  {
    from: ['下料'],
    to: ['下料BU'],
  },
  {
    from: ['结构BU1组焊'],
    to: ['结构BU1'],
  },
  {
    from: ['结构BU2组焊'],
    to: ['结构BU2'],
  },
  {
    from: ['装配', '组装'],
    to: ['组装BU'],
  },
  {
    from: ['机加'],
    to: ['机加BU'],
  },
  {
    from: ['模具'],
    to: ['模具 BU'],
  },
];

const TARGET_KEY_SET = new Set<string>(PROCESS_PASS_RATE_TARGET_ORDER);

function isValidRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  );
}

export function parsePassRateTargets(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isValidRate(value)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Build canonical process targets from saved settings and legacy keys.
 * Canonical keys always win over migrated legacy values.
 */
export function buildCanonicalProcessPassRateTargets(
  raw: unknown,
): Record<ProcessPassRateTargetKey, number> {
  const savedTargets = parsePassRateTargets(raw);
  const canonicalTargets = {
    ...DEFAULT_PROCESS_PASS_RATE_TARGETS,
  } as Record<ProcessPassRateTargetKey, number>;

  for (const key of PROCESS_PASS_RATE_TARGET_ORDER) {
    if (isValidRate(savedTargets[key])) {
      canonicalTargets[key] = savedTargets[key];
    }
  }

  for (const rule of LEGACY_TARGET_MIGRATION_RULES) {
    for (const fromKey of rule.from) {
      const legacyRate = savedTargets[fromKey];
      if (!isValidRate(legacyRate)) continue;
      for (const toKey of rule.to) {
        if (!isValidRate(savedTargets[toKey])) {
          canonicalTargets[toKey] = legacyRate;
        }
      }
    }
  }

  return canonicalTargets;
}

export function isProcessPassRateTargetKey(key: string) {
  return TARGET_KEY_SET.has(key);
}

function normalizeProcessText(value: string) {
  return value.toLowerCase().replaceAll(/\s+/g, '').replaceAll(/[：:]/g, '');
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

const COATING_KEYWORDS = ['涂装', '喷漆', '打砂'];
const OUTSOURCING_STRUCTURE_PROCESSES = [
  '组对',
  '焊接',
  '焊后尺寸',
  '整体拼装',
  '组拼',
  '外观',
];

/**
 * Normalize PROCESS inspection raw process names into dashboard buckets.
 */
export function mapProcessToPassRateBucket(
  processName: null | string,
): ProcessPassRateTargetKey | undefined {
  const rawText = String(processName || '').trim();
  if (!rawText) return undefined;
  const normalized = normalizeProcessText(rawText);
  if (includesAny(normalized, COATING_KEYWORDS)) return '外协涂装';
  if (includesAny(normalized, OUTSOURCING_STRUCTURE_PROCESSES))
    return '外协结构';
  return undefined;
}

function mapTeamToPassRateBucket(
  team: null | string,
): ProcessPassRateTargetKey | undefined {
  const rawText = String(team || '').trim();
  if (!rawText) return undefined;
  const normalized = normalizeProcessText(rawText);

  if (normalized.includes('外协结构') || normalized === '外协')
    return '外协结构';
  if (normalized.includes('外协机加')) return '外协机加';
  if (normalized.includes('外协涂装')) return '外协涂装';

  if (
    normalized.includes('结构bu1组焊') ||
    normalized.includes('结构bu1') ||
    normalized === '结构bu1' ||
    normalized === 'bu1'
  ) {
    return '结构BU1';
  }

  if (
    normalized.includes('结构bu2组焊') ||
    normalized.includes('结构bu2') ||
    normalized === '结构bu2' ||
    normalized === 'bu2'
  ) {
    return '结构BU2';
  }

  if (normalized === '下料' || normalized.includes('下料bu')) return '下料BU';
  if (
    normalized === '组装' ||
    normalized === '装配' ||
    normalized.includes('组装bu')
  )
    return '组装BU';
  if (normalized === '机加' || normalized.includes('机加bu')) return '机加BU';
  if (normalized.includes('模具')) return '模具 BU';

  return undefined;
}

/**
 * Department-first bucket mapping for pass-rate drilldown.
 * team(责任部门) has higher priority, processName as fallback.
 */
export function mapInspectionToPassRateBucket(input: {
  processName: null | string;
  team: null | string;
}): ProcessPassRateTargetKey | undefined {
  const teamBucket = mapTeamToPassRateBucket(input.team);
  const processBucket = mapProcessToPassRateBucket(input.processName);

  if (processBucket === '外协涂装') {
    return processBucket;
  }

  if (
    processBucket === '外协结构' &&
    teamBucket !== '结构BU1' &&
    teamBucket !== '结构BU2'
  ) {
    return processBucket;
  }

  return teamBucket;
}
