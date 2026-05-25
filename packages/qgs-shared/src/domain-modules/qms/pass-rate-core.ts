import type { ProcessPassRateTargetKey } from './pass-rate-process';

import { mapInspectionToPassRateBucket } from './pass-rate-process';

export type PassRateSource = 'inspection' | 'issue';

export type InspectionQuantitySource = {
  quantity: number;
  unqualifiedQuantity: null | number;
};

export type InspectionQuantitySummary = {
  qualifiedQuantity: number;
  quantity: number;
  unqualifiedQuantity: number;
};

export type IssuePassRateBucketInput = {
  category: null | string;
  incomingType: null | string;
  inspectionCategory: null | string;
  inspectionIncomingType: null | string;
  inspectionProcessName: null | string;
  inspectionTeam: null | string;
  processName: null | string;
  quantity: number;
  responsibleDepartment: string;
};

const INCOMING_ISSUE_BUCKET_ALIASES: Record<string, string> = {
  原材料: '原材料',
  外购件: '外购件',
  辅材: '辅材',
  机加成品件: '机加成品件',
  成品检验: '外购件',
};

export function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

export function normalizeInspectionQuantitySummary(
  item: InspectionQuantitySource,
): InspectionQuantitySummary {
  const totalQuantity = Math.max(0, Number(item.quantity) || 0);
  const rawUnqualified = Number(item.unqualifiedQuantity);
  const hasUnqualified = Number.isFinite(rawUnqualified);
  const unqualifiedQuantity = hasUnqualified
    ? Math.max(0, Math.min(totalQuantity, rawUnqualified))
    : 0;

  return {
    quantity: totalQuantity,
    qualifiedQuantity: totalQuantity - unqualifiedQuantity,
    unqualifiedQuantity,
  };
}

function normalizeIssueBucketText(value: null | string) {
  return String(value || '')
    .trim()
    .replaceAll(/\s+/g, '')
    .replaceAll(/[：:]/g, '');
}

export function getIssueQuantity(item: IssuePassRateBucketInput) {
  return Math.max(0, Number(item.quantity) || 0);
}

function getLinkedIssueCategory(item: IssuePassRateBucketInput) {
  const category = String(item.inspectionCategory || '')
    .trim()
    .toUpperCase();
  if (category === 'PROCESS' || category === 'INCOMING') return category;
  return undefined;
}

export function resolveIssueProcessBucket(
  item: IssuePassRateBucketInput,
): ProcessPassRateTargetKey | undefined {
  return mapInspectionToPassRateBucket({
    processName: item.inspectionProcessName || item.processName,
    team: item.inspectionTeam || item.responsibleDepartment,
  });
}

export function resolveIssueIncomingBucket(item: IssuePassRateBucketInput) {
  const candidates = [
    item.inspectionIncomingType,
    item.incomingType,
    item.processName,
    item.category,
    item.inspectionProcessName,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIssueBucketText(candidate);
    if (normalized && INCOMING_ISSUE_BUCKET_ALIASES[normalized]) {
      return INCOMING_ISSUE_BUCKET_ALIASES[normalized];
    }
  }

  return undefined;
}

export function resolveIssuePassRateCategory(item: IssuePassRateBucketInput) {
  const linkedCategory = getLinkedIssueCategory(item);
  if (linkedCategory) return linkedCategory;
  if (resolveIssueIncomingBucket(item)) return 'INCOMING';
  if (resolveIssueProcessBucket(item)) return 'PROCESS';
  return undefined;
}
