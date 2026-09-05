export const APPROVAL_EVIDENCE = 'Human Business Approval';
export const APPROVAL_SOURCE_DOCUMENT =
  'docs/metrics/metric-approval-sheet.md#final-human-decision-record';

const decisionApprovalRecords = {
  D01: {
    approvedDefinition:
      'Split BM-PASS-RATE into BM-FIRST-PASS-YIELD and BM-FINAL-PASS-RATE.',
    approvedOption: 'Split',
    decisionNote:
      'The legacy mixed semantic remains traceable and is not deleted.',
    decisionStatus: 'APPROVED',
  },
  D02: {
    approvedDefinition:
      'Establish BM-FINAL-PASS-RATE as an independent final pass metric.',
    approvedOption: 'Independent Metric',
    decisionNote: 'It remains distinct from first-pass yield.',
    decisionStatus: 'APPROVED',
  },
  D03: {
    approvedDefinition:
      'Split quality loss into gross loss, net loss, and claim recovery.',
    approvedOption: 'Split',
    decisionNote: 'Gross, net, and recovery are not interchangeable.',
    decisionStatus: 'APPROVED',
  },
  D04: {
    approvedDefinition:
      'Use separate problem closure and on-time closure metrics.',
    approvedOption: 'Split',
    decisionNote:
      'Closure rate and deadline compliance remain separate semantics.',
    decisionStatus: 'APPROVED',
  },
  D05: {
    approvedDefinition:
      'Use BM-SUPPLIER-FINAL-SCORE with standard and resident outsourcing policies.',
    approvedOption: 'Unified Concept + Dual Policy',
    decisionNote: 'The two policies remain independently versionable.',
    decisionStatus: 'APPROVED',
  },
  D06: {
    approvedDefinition:
      'Prefer request-level reinspection; do not choose another definition if revision identity is unstable.',
    approvedOption: 'Request-level priority',
    decisionNote: 'Request revision key and deduplication policy are pending.',
    decisionStatus: 'APPROVED_WITH_POLICY_PENDING',
  },
  D07: {
    approvedDefinition:
      'Split work-order completion into inspection-point completion and quantity coverage.',
    approvedOption: 'Split',
    decisionNote: 'Request closure and final pass are not completion metrics.',
    decisionStatus: 'APPROVED',
  },
  D08: {
    approvedDefinition:
      'Publish BM-VEHICLE-FAILURE-COUNT only; do not claim a rate or intensity.',
    approvedOption: 'Count only',
    decisionNote: 'No exposure denominator is approved.',
    decisionStatus: 'APPROVED',
  },
  D09: {
    approvedDefinition:
      'Archive timeliness population is generated, non-cancelled, non-N/A archive tasks.',
    approvedOption: 'Required population',
    decisionNote: 'Missing templates are not automatically included.',
    decisionStatus: 'APPROVED',
  },
  D10: {
    approvedDefinition: 'Use task dueAt for archive timeliness deadlines.',
    approvedOption: 'task dueAt',
    decisionNote: 'Working-day and holiday rules are pending.',
    decisionStatus: 'APPROVED_WITH_POLICY_PENDING',
  },
  D11: {
    approvedDefinition: 'Split DFMEA RPN value from DFMEA risk band.',
    approvedOption: 'Split',
    decisionNote:
      'RPN numeric value and risk classification are separate metrics.',
    decisionStatus: 'APPROVED',
  },
  D12: {
    approvedDefinition: 'Do not approve DFMEA risk-band thresholds yet.',
    approvedOption: 'Threshold pending',
    decisionNote: 'Threshold, effective date, and version remain pending.',
    decisionStatus: 'APPROVED_WITH_POLICY_PENDING',
  },
  D13: {
    approvedDefinition:
      'Use the Suggested Business Owner matrix; preserve joint ownership and UNKNOWN policy/data owners.',
    approvedOption: 'Suggested owner responsibility',
    decisionNote: 'No ownerDeptId is inferred from the approval.',
    decisionStatus: 'APPROVED',
  },
  D14: {
    approvedDefinition:
      'Historical computability and DataScope validation are mandatory before PHASE-2.',
    approvedOption: 'Mandatory pre-checks',
    decisionNote: 'Approval does not start consumer migration.',
    decisionStatus: 'APPROVED',
  },
} as const;

const suggestedBusinessOwners: Record<string, string> = {
  'BM-ARCHIVE-TIMELINESS': '品质文控',
  'BM-CLAIM-RECOVERY': '财务与品质联合',
  'BM-DFMEA-RISK-BAND': '工程/品质',
  'BM-DFMEA-RPN-VALUE': '工程/品质',
  'BM-FINAL-PASS-RATE': '品质部',
  'BM-FIRST-PASS-YIELD': '品质部',
  'BM-GROSS-QUALITY-LOSS': '财务与品质联合',
  'BM-INSPECTION-POINT-COMPLETION': '项目管理/品质联合',
  'BM-INSPECTION-QUANTITY-COVERAGE': '项目管理/品质联合',
  'BM-INSPECTION-REQUEST-CLOSURE-RATE': '项目管理/品质联合',
  'BM-NET-QUALITY-LOSS': '财务与品质联合',
  'BM-PROBLEM-CLOSURE-RATE': '品质部',
  'BM-PROBLEM-ONTIME-CLOSURE-RATE': '品质部',
  'BM-REINSPECTION-RATE': '品质部',
  'BM-SUPPLIER-FINAL-SCORE': '供应链/品质',
  'BM-VEHICLE-FAILURE-COUNT': '技术/售后',
};

export function approvalEvidenceCreateInput(decisionHistoryId: string) {
  return decisionHistoryId.split(',').map((decisionId) => {
    const decision =
      decisionApprovalRecords[
        decisionId as keyof typeof decisionApprovalRecords
      ];
    if (!decision) {
      throw new Error(`Missing approval evidence for ${decisionId}`);
    }
    return {
      ...decision,
      decisionBy: APPROVAL_EVIDENCE,
      decisionHistoryId: decisionId,
      decisionSource: APPROVAL_EVIDENCE,
      sourceDocument: APPROVAL_SOURCE_DOCUMENT,
    };
  });
}

export function ownerAssignmentCreateInput(metricCode: string) {
  const businessOwner = suggestedBusinessOwners[metricCode];
  if (!businessOwner) {
    throw new Error(`Missing approved business owner for ${metricCode}`);
  }
  return [
    {
      approvalEvidence: APPROVAL_EVIDENCE,
      decisionHistoryId: 'D13',
      ownerLabel: businessOwner,
      ownerRole: 'BUSINESS' as const,
      ownerStatus: 'CONFIRMED_FROM_APPROVAL' as const,
      sourceDocument: APPROVAL_SOURCE_DOCUMENT,
    },
    {
      ownerLabel: 'UNKNOWN',
      ownerRole: 'POLICY' as const,
      ownerStatus: 'UNCONFIRMED' as const,
    },
    {
      ownerLabel: 'UNKNOWN',
      ownerRole: 'DATA' as const,
      ownerStatus: 'UNCONFIRMED' as const,
    },
  ];
}
