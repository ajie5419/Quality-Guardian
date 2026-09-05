import { BusinessError } from '~/utils/business-error';

// Explicit transition matrices for the supervision domain (SEC-SUPERVISION-001).
// Status may never be written as `status = body.status` without checking the
// current state; unknown states are rejected by the shared normalizers.
export const SUPERVISION_PROJECT_TRANSITIONS: Record<string, string[]> = {
  PLANNED: ['IN_PROGRESS', 'COMPLETED', 'PAUSED'],
  IN_PROGRESS: ['COMPLETED', 'PAUSED', 'PLANNED'],
  PAUSED: ['IN_PROGRESS', 'COMPLETED', 'PLANNED'],
  // Reopening a completed project requires an explicit move back to IN_PROGRESS.
  COMPLETED: ['IN_PROGRESS'],
};

export const SUPERVISION_ISSUE_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS', 'VERIFYING', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'VERIFYING', 'CLOSED'],
  VERIFYING: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
  // A closed issue may only be reopened, never jump to another state.
  CLOSED: ['OPEN'],
};

export function assertSupervisionProjectTransition(
  current: string,
  next: string,
): void {
  if (current === next) return;
  const allowed = SUPERVISION_PROJECT_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new BusinessError(
      'CONFLICT',
      `监造项目状态不允许从 ${current} 变更为 ${next}`,
      409,
    );
  }
}

export function assertSupervisionIssueTransition(
  current: string,
  next: string,
): void {
  if (current === next) return;
  const allowed = SUPERVISION_ISSUE_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new BusinessError(
      'CONFLICT',
      `监造问题状态不允许从 ${current} 变更为 ${next}`,
      409,
    );
  }
}

/**
 * CAS state transition on a supervision record. The where clause must already
 * carry the id, the expected current status and the access predicate; a failed
 * claim means the record moved concurrently (or the caller lost access).
 */
export function throwSupervisionConflict(message: string): never {
  throw new BusinessError('CONFLICT', message, 409);
}
