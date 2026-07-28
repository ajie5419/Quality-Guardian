export type IdentityResolutionStatus = 'INVALID' | 'MISSING' | 'RESOLVED';

export interface IdentityAggregateItem {
  id: null | string;
  name: string;
  resolutionStatus: IdentityResolutionStatus;
  value: number;
}

export function createIdentityAggregateItem(params: {
  canonicalName?: null | string;
  id?: null | string;
  missingName?: string;
  value: number;
}): IdentityAggregateItem {
  const id = String(params.id || '').trim() || null;
  if (!id) {
    return {
      id: null,
      name: params.missingName || 'Unknown',
      resolutionStatus: 'MISSING',
      value: params.value,
    };
  }

  const canonicalName = String(params.canonicalName || '').trim();
  if (!canonicalName) {
    return {
      id,
      name: `Unknown (${id})`,
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
