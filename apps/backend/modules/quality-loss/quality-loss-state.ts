import type { UnifiedQualityLossStatus } from '@qgs/shared';

import { parseQualityLossStatus } from '@qgs/shared';
import { BusinessError } from '~/utils/business-error';

export const QUALITY_LOSS_STATES: readonly UnifiedQualityLossStatus[] = [
  'Pending',
  'Processing',
  'Confirmed',
  'Resolved',
];

const QUALITY_LOSS_STATE_SET = new Set<string>(QUALITY_LOSS_STATES);

// Explicit transition matrix for manual quality-loss records
// (STATE-MACHINE-001). Forward flow is Pending -> Processing -> Confirmed ->
// Resolved; corrections reopen through an explicit edge (Confirmed may return
// to Processing, Resolved only to Pending). Unknown states fail closed.
export const QUALITY_LOSS_TRANSITIONS: Record<string, readonly string[]> = {
  Pending: ['Processing', 'Confirmed', 'Resolved'],
  Processing: ['Pending', 'Confirmed', 'Resolved'],
  Confirmed: ['Processing', 'Resolved'],
  Resolved: ['Pending'],
};

export function isQualityLossStatus(
  value: unknown,
): value is UnifiedQualityLossStatus {
  return typeof value === 'string' && QUALITY_LOSS_STATE_SET.has(value);
}

/**
 * Strict write-path parse: returns the unified bucket only for known status
 * inputs; unknown text yields null so the caller can fail closed instead of
 * silently normalizing it to Pending.
 */
export function parseQualityLossUpdateStatus(
  value: unknown,
): null | UnifiedQualityLossStatus {
  if (typeof value !== 'string') return null;
  return parseQualityLossStatus(value);
}

export function assertQualityLossTransition(
  current: string,
  next: string,
): void {
  if (!isQualityLossStatus(next)) {
    throw new BusinessError('BAD_REQUEST', `无效的质量损失状态: ${next}`, 400);
  }
  if (!isQualityLossStatus(current)) {
    throw new BusinessError(
      'BAD_REQUEST',
      `质量损失记录当前状态异常: ${current}`,
      400,
    );
  }
  if (current === next) return;
  const allowed = QUALITY_LOSS_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new BusinessError(
      'CONFLICT',
      `质量损失状态不允许从 ${current} 变更为 ${next}`,
      409,
    );
  }
}
