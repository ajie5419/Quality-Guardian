import type { SupervisionAccessContext } from './supervision-access';

import { SystemLogService } from '~/modules/system-log';

/**
 * Record a supervision write for audit (SEC-SUPERVISION-001). Action keys must
 * be declared in supervisionModule.audit; see report-write.service.ts for the
 * shared convention.
 */
export async function auditSupervisionWrite(input: {
  action: string;
  context: SupervisionAccessContext;
  detailsVariables: Record<string, unknown>;
  targetId: string;
}): Promise<void> {
  await SystemLogService.auditLog('supervision', input.action, {
    detailsVariables: input.detailsVariables,
    targetId: input.targetId,
    userId: input.context.userId,
  });
}
