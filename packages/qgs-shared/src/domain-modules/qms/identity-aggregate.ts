export type IdentityResolutionStatus = 'INVALID' | 'MISSING' | 'RESOLVED';

export type IdentityResolutionReason =
  | 'CONFLICTED'
  | 'INVALID_REFERENCE'
  | 'MISSING_REQUIRED'
  | 'NOT_APPLICABLE';

export interface IdentityAggregateItem {
  id: null | string;
  name: string;
  rawName?: null | string;
  resolutionReason?: IdentityResolutionReason;
  resolutionStatus: IdentityResolutionStatus;
  value: number;
}

const IDENTITY_RESOLUTION_LABELS = {
  conflicted: '分类待治理',
  invalid: '主数据已失效',
  missing: '数据待治理',
  notApplicable: '不涉及',
} as const;

function normalizeIdentityName(value: unknown) {
  return String(value || '').trim();
}

export function formatIdentityResolutionName(params: {
  rawName?: null | string;
  reason: IdentityResolutionReason;
}) {
  const rawName = normalizeIdentityName(params.rawName);
  if (params.reason === 'NOT_APPLICABLE') {
    return IDENTITY_RESOLUTION_LABELS.notApplicable;
  }
  let prefix = IDENTITY_RESOLUTION_LABELS.missing;
  if (params.reason === 'CONFLICTED') {
    prefix = IDENTITY_RESOLUTION_LABELS.conflicted;
  } else if (params.reason === 'INVALID_REFERENCE') {
    prefix = IDENTITY_RESOLUTION_LABELS.invalid;
  }
  return rawName ? `${prefix}：${rawName}` : prefix;
}

export function createIdentityAggregateItem(params: {
  canonicalName?: null | string;
  id?: null | string;
  missingName?: string;
  rawName?: null | string;
  resolutionReason?: Exclude<IdentityResolutionReason, 'INVALID_REFERENCE'>;
  value: number;
}): IdentityAggregateItem {
  const id = normalizeIdentityName(params.id) || null;
  const rawName = normalizeIdentityName(params.rawName) || null;
  if (!id) {
    const resolutionReason = params.resolutionReason || 'MISSING_REQUIRED';
    return {
      id: null,
      name:
        normalizeIdentityName(params.missingName) ||
        formatIdentityResolutionName({ rawName, reason: resolutionReason }),
      ...(rawName ? { rawName } : {}),
      resolutionReason,
      resolutionStatus: 'MISSING',
      value: params.value,
    };
  }

  const canonicalName = normalizeIdentityName(params.canonicalName);
  if (!canonicalName) {
    return {
      id,
      name: formatIdentityResolutionName({
        rawName,
        reason: 'INVALID_REFERENCE',
      }),
      ...(rawName ? { rawName } : {}),
      resolutionReason: 'INVALID_REFERENCE',
      resolutionStatus: 'INVALID',
      value: params.value,
    };
  }

  return {
    id,
    name: canonicalName,
    resolutionStatus: 'RESOLVED',
    value: params.value,
  };
}

export function createResolvedAggregateItem(params: {
  id: string;
  name?: string;
  value: number;
}): IdentityAggregateItem {
  return {
    id: params.id,
    name: params.name || params.id,
    resolutionStatus: 'RESOLVED',
    value: params.value,
  };
}
