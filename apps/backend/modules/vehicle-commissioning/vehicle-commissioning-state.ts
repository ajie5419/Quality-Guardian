import { ISSUE_TRACKING_STATUS } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

const VEHICLE_COMMISSIONING_ISSUE_STATES = [
  ISSUE_TRACKING_STATUS.OPEN,
  ISSUE_TRACKING_STATUS.IN_PROGRESS,
  ISSUE_TRACKING_STATUS.RESOLVED,
  ISSUE_TRACKING_STATUS.CLOSED,
] as const;

const VEHICLE_COMMISSIONING_ISSUE_STATE_SET = new Set<string>(
  VEHICLE_COMMISSIONING_ISSUE_STATES,
);

// Explicit transition matrix for the vehicle-commissioning domain
// (STATE-MACHINE-001). CLOSED may only be reopened to OPEN; any other state
// must go through OPEN again so the closedAt lifecycle stays consistent.
export const VEHICLE_COMMISSIONING_ISSUE_TRANSITIONS: Record<
  string,
  readonly string[]
> = {
  [ISSUE_TRACKING_STATUS.OPEN]: [
    ISSUE_TRACKING_STATUS.IN_PROGRESS,
    ISSUE_TRACKING_STATUS.RESOLVED,
    ISSUE_TRACKING_STATUS.CLOSED,
  ],
  [ISSUE_TRACKING_STATUS.IN_PROGRESS]: [
    ISSUE_TRACKING_STATUS.OPEN,
    ISSUE_TRACKING_STATUS.RESOLVED,
    ISSUE_TRACKING_STATUS.CLOSED,
  ],
  [ISSUE_TRACKING_STATUS.RESOLVED]: [
    ISSUE_TRACKING_STATUS.OPEN,
    ISSUE_TRACKING_STATUS.IN_PROGRESS,
    ISSUE_TRACKING_STATUS.CLOSED,
  ],
  [ISSUE_TRACKING_STATUS.CLOSED]: [ISSUE_TRACKING_STATUS.OPEN],
};

export function isVehicleCommissioningIssueStatus(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    VEHICLE_COMMISSIONING_ISSUE_STATE_SET.has(value)
  );
}

/**
 * Strict write-path validation. The list/detail read paths keep the lenient
 * alias parser, but a status submitted for a create/update must be one of the
 * canonical values: unknown text must never silently degrade to OPEN (that
 * could reopen a CLOSED issue).
 */
export function assertVehicleCommissioningIssueStatus(value: unknown): void {
  if (value === undefined || value === null) return;
  const normalized = String(value).trim();
  if (!normalized) return;
  if (!isVehicleCommissioningIssueStatus(normalized)) {
    throw new BusinessError(
      'BAD_REQUEST',
      `无效的调试验收问题状态: ${normalized}`,
      400,
    );
  }
}

export function assertVehicleCommissioningIssueTransition(
  current: string,
  next: string,
): void {
  if (!isVehicleCommissioningIssueStatus(next)) {
    throw new BusinessError(
      'BAD_REQUEST',
      `无效的调试验收问题状态: ${next}`,
      400,
    );
  }
  if (!isVehicleCommissioningIssueStatus(current)) {
    throw new BusinessError(
      'BAD_REQUEST',
      `调试验收问题当前状态异常: ${current}`,
      400,
    );
  }
  if (current === next) return;
  const allowed = VEHICLE_COMMISSIONING_ISSUE_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BusinessError(
      'CONFLICT',
      `调试验收问题状态不允许从 ${current} 变更为 ${next}`,
      409,
    );
  }
}
