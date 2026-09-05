import { BusinessError } from '~/utils/business-error';

export const ACTIVATION_READINESS_FAILURES = [
  'APPROVAL_EVIDENCE_MISSING',
  'ACTIVATION_APPROVAL_MISSING',
  'BUSINESS_OWNER_UNCONFIRMED',
  'DECISION_TRACE_MISSING',
  'EFFECTIVE_DATE_MISSING',
  'POLICY_PENDING',
  'SHADOW_VALIDATION_MISSING',
] as const;

export type ActivationReadinessFailure =
  (typeof ACTIVATION_READINESS_FAILURES)[number];

export interface ActivationReadinessVersion {
  approvalEvidence: null | string;
  approvalEvidences: Array<{
    decisionBy: string;
    decisionStatus: string;
    sourceDocument: string;
  }>;
  activationEvidences?: Array<{
    activationNote: string;
    decision: string;
    decisionBy: string;
    effectiveFromAt: Date;
  }>;
  shadowEvidences?: Array<{ classification: string }>;
  decisionHistoryId: null | string;
  effectiveFromAt: Date | null;
  policyDependencies: Array<{ status: string }>;
  sourceDocument: null | string;
  shadowValidationEvidence?: null | string;
  version: number;
}

export interface ActivationReadinessDefinition {
  currentVersion: number;
  ownerAssignments: Array<{ ownerRole: string; ownerStatus: string }>;
  ownerStatus: string;
  versions: ActivationReadinessVersion[];
}

export function getActivationReadinessFailures(
  definition: ActivationReadinessDefinition,
): ActivationReadinessFailure[] {
  const currentVersion = definition.versions.find(
    (item) => item.version === definition.currentVersion,
  );
  if (!currentVersion) return ['DECISION_TRACE_MISSING'];

  const failures: ActivationReadinessFailure[] = [];
  const hasApprovedEvidence = currentVersion.approvalEvidences.some(
    (evidence) =>
      (evidence.decisionStatus === 'APPROVED' ||
        evidence.decisionStatus === 'APPROVED_WITH_POLICY_PENDING') &&
      Boolean(evidence.decisionBy.trim()) &&
      Boolean(evidence.sourceDocument.trim()),
  );
  if (!hasApprovedEvidence) failures.push('APPROVAL_EVIDENCE_MISSING');
  const activationEvidence = currentVersion.activationEvidences?.[0];
  if (
    !activationEvidence ||
    !['APPROVE', 'APPROVED'].includes(activationEvidence.decision) ||
    !activationEvidence.effectiveFromAt ||
    !activationEvidence.decisionBy.trim() ||
    !activationEvidence.activationNote.trim()
  )
    failures.push('ACTIVATION_APPROVAL_MISSING');
  if (
    !currentVersion.decisionHistoryId ||
    !currentVersion.approvalEvidence ||
    !currentVersion.sourceDocument
  ) {
    failures.push('DECISION_TRACE_MISSING');
  }
  if (!currentVersion.effectiveFromAt && !activationEvidence?.effectiveFromAt) {
    failures.push('EFFECTIVE_DATE_MISSING');
  }
  const shadowEvidence =
    'shadowValidationEvidence' in currentVersion &&
    typeof currentVersion.shadowValidationEvidence === 'string'
      ? currentVersion.shadowValidationEvidence
      : null;
  if (!shadowEvidence?.trim() && !currentVersion.shadowEvidences?.length) {
    failures.push('SHADOW_VALIDATION_MISSING');
  }
  const hasConfirmedBusinessOwner = definition.ownerAssignments.some(
    (owner) =>
      owner.ownerRole === 'BUSINESS' &&
      (owner.ownerStatus === 'CONFIRMED' ||
        owner.ownerStatus === 'CONFIRMED_FROM_APPROVAL'),
  );
  if (definition.ownerStatus === 'UNCONFIRMED' || !hasConfirmedBusinessOwner) {
    failures.push('BUSINESS_OWNER_UNCONFIRMED');
  }
  if (
    currentVersion.policyDependencies.some(
      (dependency) => dependency.status === 'PENDING',
    )
  ) {
    failures.push('POLICY_PENDING');
  }
  return failures;
}

export function assertActivationReadiness(
  definition: ActivationReadinessDefinition,
): void {
  const failures = getActivationReadinessFailures(definition);
  if (failures.length > 0) {
    throw new BusinessError(
      'CONFLICT',
      `指标尚未满足激活前置条件：${failures.join(', ')}`,
      409,
    );
  }
}
