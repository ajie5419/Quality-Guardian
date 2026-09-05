import type {
  CreateMetricDefinitionInput,
  MetricVersionInput,
} from './metric-governance.types';

interface PolicyDependencyInput {
  decisionHistoryId: string;
  pendingPolicy: string;
  policyCode: string;
}

interface ApprovedMetricDefinition extends CreateMetricDefinitionInput {
  decisionHistoryId: string;
  policyDependencies?: PolicyDependencyInput[];
}

function version(input: Omit<MetricVersionInput, 'effectiveFromAt'>) {
  return { ...input, effectiveFromAt: null };
}

export const approvedCanonicalMetricDefinitions: ApprovedMetricDefinition[] = [
  {
    metricCode: 'BM-FIRST-PASS-YIELD',
    metricName: 'First Pass Yield',
    domain: 'inspection',
    category: 'A',
    decisionHistoryId: 'D01',
    version: version({
      businessDefinition:
        'First valid inspection PASS count divided by the first valid inspection population.',
      numeratorDefinition: 'First valid inspections with PASS result.',
      denominatorDefinition: 'First valid inspections with a final result.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'inspections' },
      sourceFields: {
        result: ['result'],
        inspection: ['id', 'inspectionDate'],
      },
      dimensions: {
        supported: ['period', 'inspectionCategory', 'process', 'department'],
      },
      exclusions: {
        cancelled: 'excluded',
        reinspection: 'not counted as first inspection',
      },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D01 approved canonical split.',
    }),
  },
  {
    metricCode: 'BM-FINAL-PASS-RATE',
    metricName: 'Final Pass Rate',
    domain: 'inspection',
    category: 'A',
    decisionHistoryId: 'D02',
    version: version({
      businessDefinition:
        'Final PASS count divided by completed final inspection determinations.',
      numeratorDefinition: 'Completed final determinations with PASS result.',
      denominatorDefinition: 'Completed final inspection determinations.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'inspections' },
      sourceFields: {
        result: ['result'],
        finalization: ['status', 'inspectionDate'],
      },
      dimensions: {
        supported: ['period', 'inspectionCategory', 'process', 'department'],
      },
      exclusions: { cancelled: 'excluded', unresolvedFinalResult: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D02 approved independent final pass metric.',
    }),
  },
  {
    metricCode: 'BM-GROSS-QUALITY-LOSS',
    metricName: 'Gross Quality Loss',
    domain: 'quality-loss',
    category: 'A',
    decisionHistoryId: 'D03',
    version: version({
      businessDefinition:
        'Total incurred quality loss before confirmed recovery.',
      formulaType: 'SUM',
      sourceModel: {
        primary: 'quality_loss_index',
        related: ['quality_losses'],
      },
      sourceFields: { amount: ['amount'], occurredAt: ['occurDate'] },
      dimensions: { supported: ['period', 'source', 'department', 'lossType'] },
      exclusions: {
        cancelled: 'excluded',
        duplicate: 'excluded by source governance',
      },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY_OR_INDEX',
      unit: 'CNY',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D03 approved gross/net/recovery split.',
    }),
  },
  {
    metricCode: 'BM-NET-QUALITY-LOSS',
    metricName: 'Net Quality Loss',
    domain: 'quality-loss',
    category: 'A',
    decisionHistoryId: 'D03',
    version: version({
      businessDefinition: 'Gross quality loss less confirmed claim recovery.',
      formulaType: 'SUM',
      sourceModel: {
        primary: 'quality_loss_index',
        related: ['quality_losses'],
      },
      sourceFields: {
        grossLoss: ['amount'],
        confirmedRecovery: ['actualClaim'],
      },
      dimensions: { supported: ['period', 'source', 'department', 'lossType'] },
      exclusions: { unconfirmedRecovery: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY_OR_INDEX',
      unit: 'CNY',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D03 approved gross/net/recovery split.',
    }),
  },
  {
    metricCode: 'BM-CLAIM-RECOVERY',
    metricName: 'Claim Recovery',
    domain: 'quality-loss',
    category: 'A',
    decisionHistoryId: 'D03',
    version: version({
      businessDefinition: 'Actual confirmed quality-loss recovery amount.',
      formulaType: 'SUM',
      sourceModel: {
        primary: 'quality_loss_index',
        related: ['quality_losses'],
      },
      sourceFields: { confirmedRecovery: ['actualClaim'] },
      dimensions: { supported: ['period', 'source', 'department', 'supplier'] },
      exclusions: { unconfirmedRecovery: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY_OR_INDEX',
      unit: 'CNY',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D03 approved gross/net/recovery split.',
    }),
  },
  {
    metricCode: 'BM-PROBLEM-CLOSURE-RATE',
    metricName: 'Problem Closure Rate',
    domain: 'inspection',
    category: 'A',
    decisionHistoryId: 'D04',
    version: version({
      businessDefinition:
        'Closed problems divided by the approved problem population.',
      numeratorDefinition: 'Closed quality problems.',
      denominatorDefinition: 'Quality problems in the approved population.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'quality_records' },
      sourceFields: {
        closed: ['status', 'closedAt'],
        population: ['createdAt', 'status'],
      },
      dimensions: {
        supported: ['period', 'department', 'process', 'supplier'],
      },
      exclusions: { withdrawn: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D04 approved closure and on-time closure split.',
    }),
  },
  {
    metricCode: 'BM-PROBLEM-ONTIME-CLOSURE-RATE',
    metricName: 'Problem On-time Closure Rate',
    domain: 'inspection',
    category: 'A',
    decisionHistoryId: 'D04',
    version: version({
      businessDefinition:
        'Problems closed by their approved deadline divided by due problems.',
      numeratorDefinition:
        'Problems closed on or before the approved deadline.',
      denominatorDefinition: 'Problems with an approved closure deadline.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'quality_records' },
      sourceFields: { closedAt: ['closedAt'], deadline: ['dueAt'] },
      dimensions: {
        supported: ['period', 'department', 'process', 'supplier'],
      },
      exclusions: { missingDeadline: 'excluded pending policy evidence' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D04 approved closure and on-time closure split.',
    }),
  },
  {
    metricCode: 'BM-SUPPLIER-FINAL-SCORE',
    metricName: 'Supplier Final Quality Score',
    domain: 'supplier',
    category: 'A',
    decisionHistoryId: 'D05',
    version: version({
      businessDefinition:
        'Unified supplier quality score concept governed by STANDARD_SUPPLIER_SCORE_POLICY or RESIDENT_OUTSOURCING_SCORE_POLICY.',
      formulaType: 'WEIGHTED_SCORE',
      sourceModel: { primary: 'supplier_score_snapshots' },
      sourceFields: {
        score: ['finalQualityScore'],
        policyInputs: ['incomingScore', 'engineeringScore', 'afterSalesScore'],
      },
      dimensions: { supported: ['supplier', 'category', 'outsourcingMode'] },
      exclusions: { inactiveSupplier: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SNAPSHOT_REFRESH',
      unit: 'score',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D05 approved unified concept with dual policy.',
    }),
  },
  {
    metricCode: 'BM-REINSPECTION-RATE',
    metricName: 'Reinspection Rate',
    domain: 'inspection',
    category: 'B',
    decisionHistoryId: 'D06',
    policyDependencies: [
      {
        decisionHistoryId: 'D06',
        policyCode: 'REINSPECTION_REQUEST_REVISION_POLICY',
        pendingPolicy:
          'Stable request revision key and request-level deduplication rule.',
      },
    ],
    version: version({
      businessDefinition:
        'Request-level reinspection events divided by eligible inspection requests, subject to the approved revision-key policy.',
      numeratorDefinition: 'Eligible request-level reinspection events.',
      denominatorDefinition: 'Eligible inspection requests.',
      formulaType: 'PERCENTAGE',
      sourceModel: {
        primary: 'qms_inspection_requests',
        related: ['inspections'],
      },
      sourceFields: {
        request: ['id'],
        revision: ['revision'],
        reinspection: ['status'],
      },
      dimensions: { supported: ['period', 'inspectionCategory', 'process'] },
      exclusions: { duplicateRevision: 'pending policy' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'BUSINESS_DECISION_REQUIRED',
      changeReason:
        'PHASE-1.7 D06 approved request-level priority with pending revision policy.',
    }),
  },
  {
    metricCode: 'BM-INSPECTION-POINT-COMPLETION',
    metricName: 'Inspection Point Completion',
    domain: 'work-order',
    category: 'B',
    decisionHistoryId: 'D07',
    version: version({
      businessDefinition:
        'Completed required inspection points divided by planned inspection points.',
      numeratorDefinition: 'Completed required inspection points.',
      denominatorDefinition: 'Planned applicable inspection points.',
      formulaType: 'PERCENTAGE',
      sourceModel: {
        primary: 'work_order_requirements',
        related: ['inspections'],
      },
      sourceFields: {
        planned: ['requirementItems'],
        completed: ['inspectionItems'],
      },
      dimensions: { supported: ['workOrder', 'project', 'period'] },
      exclusions: { cancelled: 'excluded', notApplicable: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D07 approved completion split.',
    }),
  },
  {
    metricCode: 'BM-INSPECTION-QUANTITY-COVERAGE',
    metricName: 'Inspection Quantity Coverage',
    domain: 'work-order',
    category: 'B',
    decisionHistoryId: 'D07',
    version: version({
      businessDefinition:
        'Completed inspection quantity divided by applicable planned quantity.',
      numeratorDefinition: 'Completed inspection quantity.',
      denominatorDefinition: 'Applicable planned quantity.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'work_orders', related: ['inspections'] },
      sourceFields: {
        planned: ['totalQuantity'],
        completed: ['completedQuantity'],
      },
      dimensions: { supported: ['workOrder', 'project', 'period'] },
      exclusions: { cancelled: 'excluded', notApplicable: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D07 approved completion split.',
    }),
  },
  {
    metricCode: 'BM-INSPECTION-REQUEST-CLOSURE-RATE',
    metricName: 'Inspection Request Closure Rate',
    domain: 'work-order',
    category: 'B',
    decisionHistoryId: 'D07',
    version: version({
      businessDefinition:
        'Closed inspection requests divided by applicable inspection requests; not a completion or pass metric.',
      numeratorDefinition: 'Closed inspection requests.',
      denominatorDefinition: 'Applicable inspection requests.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'qms_inspection_requests' },
      sourceFields: { request: ['id'], status: ['status'] },
      dimensions: { supported: ['workOrder', 'project', 'period'] },
      exclusions: { cancelled: 'excluded', notApplicable: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D07 records request closure outside completion.',
    }),
  },
  {
    metricCode: 'BM-VEHICLE-FAILURE-COUNT',
    metricName: 'Vehicle Failure Count',
    domain: 'vehicle-commissioning',
    category: 'B',
    decisionHistoryId: 'D08',
    version: version({
      businessDefinition:
        'Count of eligible vehicle failure issues; no rate or intensity claim is made.',
      formulaType: 'COUNT',
      sourceModel: { primary: 'vehicle_commissioning_issues' },
      sourceFields: {
        failure: ['id'],
        occurredAt: ['occurDate'],
        warranty: ['isWarranty'],
      },
      dimensions: { supported: ['vehicleModel', 'period', 'failureType'] },
      exclusions: { invalidIssue: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: 'count',
      precision: 0,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D08 approved failure count only.',
    }),
  },
  {
    metricCode: 'BM-ARCHIVE-TIMELINESS',
    metricName: 'Inspection Archive Timeliness',
    domain: 'report',
    category: 'B',
    decisionHistoryId: 'D09,D10',
    policyDependencies: [
      {
        decisionHistoryId: 'D10',
        policyCode: 'ARCHIVE_TIMELINESS_CALENDAR_POLICY',
        pendingPolicy:
          'Calendar type, working-day rule, and holiday rule for task dueAt.',
      },
    ],
    version: version({
      businessDefinition:
        'On-time archive tasks divided by generated, non-cancelled, non-N/A archive tasks, using task dueAt.',
      numeratorDefinition: 'Required archive tasks completed by task dueAt.',
      denominatorDefinition:
        'Generated archive tasks that are neither cancelled nor N/A.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'inspection_archive_tasks' },
      sourceFields: {
        completedAt: ['completedAt'],
        dueAt: ['dueAt'],
        status: ['status'],
      },
      dimensions: { supported: ['period', 'department', 'inspectionCategory'] },
      exclusions: {
        missingTemplate: 'not in denominator',
        cancelled: 'excluded',
        notApplicable: 'excluded',
      },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      conflictStatus: 'BUSINESS_DECISION_REQUIRED',
      changeReason:
        'PHASE-1.7 D09/D10 approved population and dueAt with pending calendar policy.',
    }),
  },
  {
    metricCode: 'BM-DFMEA-RPN-VALUE',
    metricName: 'DFMEA RPN Value',
    domain: 'dfmea',
    category: 'B',
    decisionHistoryId: 'D11',
    version: version({
      businessDefinition:
        'DFMEA risk priority number value, separately governed from risk bands.',
      formulaType: 'RPN',
      sourceModel: { primary: 'dfmea' },
      sourceFields: {
        severity: ['severity'],
        occurrence: ['occurrence'],
        detection: ['detection'],
        rpn: ['rpn'],
      },
      dimensions: { supported: ['project', 'product', 'process'] },
      exclusions: { retiredItems: 'excluded' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: 'RPN',
      precision: 0,
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason: 'PHASE-1.7 D11 approved RPN value/risk band split.',
    }),
  },
  {
    metricCode: 'BM-DFMEA-RISK-BAND',
    metricName: 'DFMEA Risk Band',
    domain: 'dfmea',
    category: 'B',
    decisionHistoryId: 'D11,D12',
    policyDependencies: [
      {
        decisionHistoryId: 'D12',
        policyCode: 'DFMEA_RISK_BAND_THRESHOLD_POLICY',
        pendingPolicy: 'Risk-band threshold, effective date, and version.',
      },
    ],
    version: version({
      businessDefinition:
        'DFMEA risk band derived from an approved risk-band threshold policy.',
      formulaType: 'INDEX',
      sourceModel: { primary: 'dfmea' },
      sourceFields: { rpn: ['rpn'] },
      dimensions: { supported: ['project', 'product', 'process', 'riskBand'] },
      exclusions: { missingApprovedThreshold: 'policy pending' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: 'count',
      precision: 0,
      conflictStatus: 'BUSINESS_DECISION_REQUIRED',
      changeReason:
        'PHASE-1.7 D11/D12 split recorded with threshold policy pending.',
    }),
  },
];
