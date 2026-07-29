export {
  buildCanonicalProcessPassRateTargets,
  DEFAULT_PROCESS_PASS_RATE_TARGETS,
  isProcessPassRateTargetKey,
  mapIdentityToPassRateBucket,
  mapInspectionToPassRateBucket,
  mapProcessToPassRateBucket,
  parsePassRateIdentityBindings,
  parsePassRateTargets,
  PROCESS_PASS_RATE_TARGET_ORDER,
} from '@qgs/shared';
export {
  getIssueQuantity,
  normalizeInspectionQuantitySummary,
  resolveIssueIncomingBucket,
  resolveIssuePassRateCategory,
  resolveIssueProcessBucket,
  roundPercent,
} from '@qgs/shared';
export type {
  InspectionQuantitySource,
  IssuePassRateBucketInput,
  PassRateIdentityBindings,
  ProcessPassRateTargetKey,
} from '@qgs/shared';
