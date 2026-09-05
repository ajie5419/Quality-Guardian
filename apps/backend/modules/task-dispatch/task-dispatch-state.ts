import { TASK_DISPATCH_STATUS } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

const TASK_DISPATCH_STATES = new Set<string>(
  Object.values(TASK_DISPATCH_STATUS),
);

// Explicit transition matrix for the task-dispatch domain (STATE-MACHINE-001).
// Status may never be written as `status = body.status` without checking the
// current state; every user-driven transition must be CAS-guarded on the
// expected current status. COMPLETED / CANCELLED are terminal states: reopening
// requires an explicit product decision (no silent rollback).
export const TASK_DISPATCH_TRANSITIONS: Record<string, readonly string[]> = {
  [TASK_DISPATCH_STATUS.PENDING]: [
    TASK_DISPATCH_STATUS.DISPATCHED,
    TASK_DISPATCH_STATUS.PROCESSING,
    TASK_DISPATCH_STATUS.COMPLETED,
    TASK_DISPATCH_STATUS.CANCELLED,
  ],
  [TASK_DISPATCH_STATUS.DISPATCHED]: [
    TASK_DISPATCH_STATUS.PROCESSING,
    TASK_DISPATCH_STATUS.COMPLETED,
    TASK_DISPATCH_STATUS.CANCELLED,
  ],
  [TASK_DISPATCH_STATUS.PROCESSING]: [
    TASK_DISPATCH_STATUS.COMPLETED,
    TASK_DISPATCH_STATUS.CANCELLED,
  ],
  [TASK_DISPATCH_STATUS.COMPLETED]: [],
  [TASK_DISPATCH_STATUS.CANCELLED]: [],
};

export function isTaskDispatchStatus(value: unknown): value is string {
  return (
    typeof value === 'string' && TASK_DISPATCH_STATES.has(value.toUpperCase())
  );
}

/**
 * Asserts that `current -> next` is a legal task-dispatch transition.
 * Unknown states fail closed with 400; illegal jumps fail with 409 so the
 * client refreshes instead of silently corrupting the workflow.
 */
export function assertTaskDispatchTransition(
  current: string,
  next: string,
): void {
  if (!isTaskDispatchStatus(next)) {
    throw new BusinessError('BAD_REQUEST', `无效的任务状态: ${next}`, 400);
  }
  if (!isTaskDispatchStatus(current)) {
    throw new BusinessError('BAD_REQUEST', `任务当前状态异常: ${current}`, 400);
  }
  const normalizedCurrent = current.toUpperCase();
  const normalizedNext = next.toUpperCase();
  if (normalizedCurrent === normalizedNext) return;
  const allowed = TASK_DISPATCH_TRANSITIONS[normalizedCurrent] ?? [];
  if (!allowed.includes(normalizedNext)) {
    throw new BusinessError(
      'CONFLICT',
      `任务状态不允许从 ${current} 变更为 ${next}`,
      409,
    );
  }
}
