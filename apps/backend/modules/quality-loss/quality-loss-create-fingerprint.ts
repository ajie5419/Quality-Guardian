import { parseQualityLossDate, parseQualityLossNumber } from '@qgs/shared';
import { buildRequestFingerprint } from '~/modules/idempotency';

/**
 * Stable fingerprint for the quality-loss create request
 * (IDEMPOTENCY-KEY-001 / PHASE-1 pilot). Only the business-semantic fields
 * that decide the create outcome are included: work order / part identity,
 * loss type, amounts, occur date and responsibility. Volatile UI fields
 * (attachments order, timestamps, client-side noise) are excluded. The
 * fingerprint only detects "same key, different payload"; it never decides
 * whether two different keys are the same business event.
 */
export function buildQualityLossCreateRequestFingerprint(
  body: Record<string, unknown>,
  context: {
    partId: null | string;
    partName: string;
    projectId: null | string;
    projectName: string;
    workOrderNumber: string;
  },
): string {
  const occurDate = body.date
    ? parseQualityLossDate(body.date).toISOString().slice(0, 10)
    : null;
  return buildRequestFingerprint({
    actualClaim: parseQualityLossNumber(body.actualClaim, 0),
    amount: parseQualityLossNumber(body.amount, 0),
    date: occurDate,
    description:
      typeof body.description === 'string' ? body.description.trim() : null,
    partId: context.partId,
    partName: context.partName,
    projectId: context.projectId,
    projectName: context.projectName,
    responsibleDepartmentId:
      typeof body.responsibleDepartmentId === 'string'
        ? body.responsibleDepartmentId.trim()
        : null,
    type: String(body.type || ''),
    workOrderNumber: context.workOrderNumber,
  });
}
