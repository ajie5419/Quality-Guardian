import type { VehicleCommissioningIssue } from '@qgs/shared';

import {
  formatDate,
  ISSUE_TRACKING_STATUS,
  normalizeIssueTrackingStatus,
  safeNumber,
  tryParsePhotos,
} from '@qgs/shared';
import prisma from '~/utils/prisma';

const ISSUE_SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  major: 2,
  minor: 1,
};

const DEFAULT_CLAIM_STATUS = 'OPEN';

type VehicleIssueRow = Awaited<
  ReturnType<typeof prisma.vehicle_commissioning_issues.findMany>
>[number];

export function parseVehicleCommissioningIssueStatus(
  value: unknown,
): VehicleCommissioningIssue['status'] {
  return normalizeIssueTrackingStatus(value, {
    allowed: [
      ISSUE_TRACKING_STATUS.OPEN,
      ISSUE_TRACKING_STATUS.IN_PROGRESS,
      ISSUE_TRACKING_STATUS.RESOLVED,
      ISSUE_TRACKING_STATUS.CLOSED,
    ],
    fallback: ISSUE_TRACKING_STATUS.OPEN,
  }) as VehicleCommissioningIssue['status'];
}

export function normalizeVehicleCommissioningPhotos(photos?: string[]) {
  return JSON.stringify((photos || []).filter(Boolean));
}

export function getVehicleCommissioningSeverityLabel(severity?: string) {
  const value = String(severity || '').toLowerCase();
  if (value === 'critical') return '严重';
  if (value === 'major') return '一般';
  return '轻微';
}

export function getVehicleCommissioningSeverityRank(severity?: string) {
  return ISSUE_SEVERITY_RANK[String(severity || '').toLowerCase()] || 0;
}

export function getVehicleCommissioningStatusLabel(status: string) {
  if (status === 'CLOSED') return '已关闭';
  if (status === 'IN_PROGRESS') return '处理中';
  if (status === 'RESOLVED') return '待验证';
  return '待处理';
}

export function mapVehicleCommissioningIssueToDto(
  row: VehicleIssueRow,
): VehicleCommissioningIssue {
  return {
    claimNotes: row.claimNotes || '',
    claimStatus: row.claimStatus || DEFAULT_CLAIM_STATUS,
    closedAt: row.closedAt ? row.closedAt.toISOString() : '',
    createdAt: row.createdAt.toISOString(),
    date: formatDate(row.date),
    description: row.description || '',
    id: row.id,
    isClaim: Boolean(row.isClaim),
    lossAmount: safeNumber(row.lossAmount),
    partName: row.partName || '',
    photos: tryParsePhotos(row.issuePhoto),
    projectName: row.projectName || '',
    recoveredAmount: safeNumber(row.recoveredAmount),
    responsibleDepartment: row.responsibleDepartment || '',
    severity: row.severity || '',
    solution: row.solution || '',
    status: parseVehicleCommissioningIssueStatus(row.status),
    title: row.description || '',
    updatedAt: row.updatedAt.toISOString(),
    workOrderNumber: row.workOrderNumber || '',
  };
}
