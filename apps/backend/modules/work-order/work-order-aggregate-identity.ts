import type {
  IdentityResolutionReason,
  IdentityResolutionStatus,
} from '@qgs/shared';

import { createIdentityAggregateItem } from '@qgs/shared';

export type AggregateIdentity = {
  id: null | string;
  name: string;
  rawName?: null | string;
  resolutionReason?: IdentityResolutionReason;
  resolutionStatus: IdentityResolutionStatus;
};

export type DimensionStats = {
  identity: AggregateIdentity;
  inspectedPoints: number;
  plannedPoints: number;
};

export function normalizeAggregateLabel(value: unknown) {
  return String(value || '').trim() || 'Unspecified';
}

export function getAggregateIdentityKey(
  id: null | string,
  unresolvedKey: string,
) {
  return id ? `ID:${id}` : `MISSING:${unresolvedKey}`;
}

export function getAggregateGroupKey(
  partId: null | string,
  processId: null | string,
  unresolvedKey: string,
) {
  return partId && processId
    ? JSON.stringify([partId, processId])
    : `MISSING:${unresolvedKey}`;
}

export function resolveAggregateIdentity(params: {
  canonicalNames: Map<string, null | string>;
  id: unknown;
  snapshot: unknown;
}): AggregateIdentity {
  const id = String(params.id || '').trim() || null;
  const snapshot = String(params.snapshot || '').trim() || null;
  const identity = createIdentityAggregateItem({
    canonicalName: id ? params.canonicalNames.get(id) : null,
    id,
    rawName: snapshot,
    value: 0,
  });
  const { value: _value, ...result } = identity;
  return result;
}

export function mapAggregateDimensionStats(
  map: Map<string, DimensionStats>,
  dimension: 'part' | 'process',
) {
  return [...map.values()]
    .map((value) => {
      const plannedPoints = value.plannedPoints;
      const inspectedPoints = Math.min(
        value.inspectedPoints,
        plannedPoints || 0,
      );
      const missingPoints = Math.max(plannedPoints - inspectedPoints, 0);
      const completionRate =
        plannedPoints > 0
          ? Number(((inspectedPoints / plannedPoints) * 100).toFixed(1))
          : 0;
      return {
        completionRate,
        [`${dimension}Id`]: value.identity.id,
        [`${dimension}Name`]: value.identity.name,
        [`${dimension}ResolutionStatus`]: value.identity.resolutionStatus,
        inspectedPoints,
        missingPoints,
        plannedPoints,
      };
    })
    .sort((a, b) => Number(b.missingPoints) - Number(a.missingPoints));
}
