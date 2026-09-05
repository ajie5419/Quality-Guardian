import { buildRequestFingerprint } from '~/modules/idempotency';

/**
 * Stable fingerprint for the vehicle-commissioning issue create request
 * (IDEMPOTENCY-KEY-001 / PHASE-2). Only business-semantic fields are
 * included; photos keep a sorted URL signature. The fingerprint only detects
 * "same key, different payload" (409 REUSED).
 */
export function buildVehicleCommissioningIssueCreateRequestFingerprint(
  body: Record<string, unknown>,
): string {
  const photos = Array.isArray(body.photos)
    ? body.photos.map(String).filter(Boolean).sort()
    : [];
  return buildRequestFingerprint({
    assignee: text(body.assignee),
    claimNotes: text(body.claimNotes),
    claimStatus: text(body.claimStatus),
    date: dateOnly(body.date),
    description: text(body.description),
    isClaim:
      body.isClaim === undefined
        ? null
        : ['1', 'true', 'yes', '是'].includes(
            String(body.isClaim).toLowerCase(),
          ),
    lossAmount: number(body.lossAmount),
    partName: text(body.partName),
    photos,
    projectName: text(body.projectName),
    recoveredAmount: number(body.recoveredAmount),
    responsibleDepartment: text(body.responsibleDepartment),
    severity: text(body.severity),
    solution: text(body.solution),
    status: text(body.status),
    title: text(body.title),
    workOrderNumber: text(body.workOrderNumber),
  });
}

function text(value: unknown): null | string {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function number(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: unknown): null | string {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
