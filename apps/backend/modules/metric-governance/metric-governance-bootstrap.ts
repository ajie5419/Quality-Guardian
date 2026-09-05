import type { CreateMetricDefinitionInput } from './metric-governance.types';

import prisma from '~/utils/prisma';

const DRAFT_CONFLICT = 'BUSINESS_DECISION_REQUIRED' as const;

const canonicalMetricDefinitions: CreateMetricDefinitionInput[] = [
  {
    metricCode: 'BM-PASS-RATE',
    metricName: 'Primary Inspection Pass Rate',
    domain: 'inspection',
    category: 'A',
    version: {
      businessDefinition:
        'Percentage of qualified inspection quantity within the selected reporting scope.',
      numeratorDefinition: 'Qualified inspection quantity.',
      denominatorDefinition:
        'Total inspection quantity eligible for the reporting scope.',
      formulaType: 'PERCENTAGE',
      sourceModel: {
        primary: 'inspections',
        projections: ['pass_rate_process_identity_projection'],
      },
      sourceFields: {
        denominator: ['quantity'],
        numeratorInputs: ['quantity', 'unqualifiedQuantity'],
        status: ['result'],
      },
      dimensions: {
        supported: ['period', 'inspectionCategory', 'process', 'department'],
      },
      exclusions: {
        unresolvedIdentity: 'requires business decision',
        nonFinalRecords: 'implementation dependent',
      },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY_OR_PROJECTION',
      unit: '%',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; formula conflict remains unresolved.',
    },
  },
  {
    metricCode: 'BM-QUALITY-LOSS-TREND',
    metricName: 'Quality Loss Total and Trend',
    domain: 'quality-loss',
    category: 'A',
    version: {
      businessDefinition:
        'Quality loss amount and its period trend under the applicable loss accounting scope.',
      formulaType: 'SUM',
      sourceModel: {
        primary: 'quality_loss_index',
        sourceFacts: ['quality_losses'],
      },
      sourceFields: {
        amount: ['amount', 'actualClaim'],
        occurredAt: ['occurDate'],
      },
      dimensions: { supported: ['period', 'source', 'department', 'lossType'] },
      exclusions: {
        cancelled: 'implementation dependent',
        duplicate: 'implementation dependent',
      },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY_OR_INDEX',
      unit: 'CNY',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; loss source and period rules remain unresolved.',
    },
  },
  {
    metricCode: 'BM-PROBLEM-CLOSURE-RATE',
    metricName: 'Problem Closure Rate',
    domain: 'inspection',
    category: 'A',
    version: {
      businessDefinition:
        'Percentage of quality problems closed within the selected reporting population.',
      numeratorDefinition: 'Closed quality problems.',
      denominatorDefinition:
        'Quality problems in the selected reporting population.',
      formulaType: 'PERCENTAGE',
      sourceModel: { primary: 'quality_records' },
      sourceFields: {
        closed: ['status', 'closedAt'],
        population: ['createdAt', 'status'],
      },
      dimensions: {
        supported: ['period', 'department', 'process', 'supplier'],
      },
      exclusions: { withdrawn: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; denominator period semantics remain unresolved.',
    },
  },
  {
    metricCode: 'BM-AFTER-SALES-NET-LOSS',
    metricName: 'After-sales Net Loss',
    domain: 'after-sales',
    category: 'A',
    version: {
      businessDefinition:
        'Net after-sales loss after the currently recognized compensation treatment.',
      formulaType: 'SUM',
      sourceModel: { primary: 'after_sales' },
      sourceFields: {
        netLossInputs: ['materialCost', 'laborTravelCost', 'actualClaim'],
        occurredAt: ['occurDate'],
      },
      dimensions: {
        supported: ['period', 'customer', 'product', 'responsibility'],
      },
      exclusions: { cancelled: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: 'CNY',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason:
        'Phase-1 inventory bootstrap; candidate remains a draft pending business confirmation.',
    },
  },
  {
    metricCode: 'BM-SUPPLIER-FINAL-SCORE',
    metricName: 'Supplier Final Quality Score',
    domain: 'supplier',
    category: 'A',
    version: {
      businessDefinition:
        'Final supplier quality score produced by the approved supplier scoring policy.',
      formulaType: 'WEIGHTED_SCORE',
      sourceModel: {
        primary: 'supplier_score_snapshots',
        sources: ['suppliers', 'inspections', 'quality_records', 'after_sales'],
      },
      sourceFields: {
        score: ['finalQualityScore'],
        policyInputs: ['incomingScore', 'engineeringScore', 'afterSalesScore'],
      },
      dimensions: { supported: ['supplier', 'category', 'outsourcingMode'] },
      exclusions: { inactiveSupplier: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SNAPSHOT_REFRESH',
      unit: 'score',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; scoring weights and thresholds require policy governance.',
    },
  },
  {
    metricCode: 'BM-REINSPECTION-RATE',
    metricName: 'Reinspection Rate',
    domain: 'inspection',
    category: 'B',
    version: {
      businessDefinition:
        'Percentage of inspection records requiring reinspection within the selected population.',
      numeratorDefinition: 'Inspection records marked for reinspection.',
      denominatorDefinition:
        'Inspection records eligible for reinspection measurement.',
      formulaType: 'PERCENTAGE',
      sourceModel: {
        primary: 'qms_inspection_requests',
        related: ['inspections'],
      },
      sourceFields: {
        reinspection: ['status', 'reinspectionCount'],
        population: ['id', 'createdAt'],
      },
      dimensions: { supported: ['period', 'inspectionCategory', 'process'] },
      exclusions: { nonApplicable: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: 'CANONICAL_CANDIDATE',
      changeReason:
        'Phase-1 inventory bootstrap; candidate remains a draft pending business confirmation.',
    },
  },
  {
    metricCode: 'BM-WORK-ORDER-INSPECTION-COMPLETION',
    metricName: 'Work-order Inspection Completion',
    domain: 'work-order',
    category: 'B',
    version: {
      businessDefinition:
        'Completion progress of required inspection work for a work order.',
      formulaType: 'PERCENTAGE',
      sourceModel: {
        primary: 'work_order_requirements',
        related: ['inspections', 'qms_inspection_requests'],
      },
      sourceFields: {
        completed: ['requirementItems', 'inspectionItems'],
        planned: ['requirementItems'],
      },
      dimensions: { supported: ['workOrder', 'project', 'period'] },
      exclusions: { cancelled: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; point and quantity completion variants remain unresolved.',
    },
  },
  {
    metricCode: 'BM-VEHICLE-FAILURE-INTENSITY',
    metricName: 'Vehicle Failure Intensity',
    domain: 'vehicle-commissioning',
    category: 'B',
    version: {
      businessDefinition:
        'Failure intensity for commissioned vehicles during the applicable warranty or operating period.',
      formulaType: 'RATIO',
      sourceModel: {
        primary: 'vehicle_commissioning_issues',
        manualOverride: ['system_settings'],
      },
      sourceFields: {
        failures: ['id', 'failureCount'],
        exposure: ['vehicleCount', 'operatingHours'],
      },
      dimensions: { supported: ['vehicleModel', 'period', 'failureType'] },
      exclusions: { manuallyEntered: 'requires business decision' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: 'failures/vehicle',
      precision: 4,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; exposure denominator and manual value treatment remain unresolved.',
    },
  },
  {
    metricCode: 'BM-ARCHIVE-TIMELINESS',
    metricName: 'Inspection Archive Timeliness',
    domain: 'report',
    category: 'B',
    version: {
      businessDefinition:
        'Percentage of required inspection archives completed within the defined time limit.',
      numeratorDefinition: 'Required archives completed within the time limit.',
      denominatorDefinition:
        'Required archives due within the selected reporting scope.',
      formulaType: 'PERCENTAGE',
      sourceModel: {
        primary: 'inspection_archive_tasks',
        related: ['quality_records', 'inspections'],
      },
      sourceFields: {
        completedAt: ['completedAt'],
        dueAt: ['dueAt'],
        status: ['status'],
      },
      dimensions: { supported: ['period', 'department', 'inspectionCategory'] },
      exclusions: { exempt: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: '%',
      precision: 2,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; required population and deadline rule remain unresolved.',
    },
  },
  {
    metricCode: 'BM-DFMEA-RPN-RISK',
    metricName: 'DFMEA RPN Risk',
    domain: 'dfmea',
    category: 'B',
    version: {
      businessDefinition:
        'Risk priority number for DFMEA items under the approved scoring policy.',
      formulaType: 'RPN',
      sourceModel: { primary: 'dfmea' },
      sourceFields: {
        severity: ['severity'],
        occurrence: ['occurrence'],
        detection: ['detection'],
        rpn: ['rpn'],
      },
      dimensions: { supported: ['project', 'product', 'process'] },
      exclusions: { retiredItems: 'implementation dependent' },
      scopePolicy: 'SOURCE_INHERITED',
      refreshPolicy: 'SOURCE_QUERY',
      unit: 'RPN',
      precision: 0,
      effectiveFromAt: new Date('2026-08-21T00:00:00.000Z'),
      conflictStatus: DRAFT_CONFLICT,
      changeReason:
        'Phase-1 inventory bootstrap; RPN scoring thresholds require policy confirmation.',
    },
  },
];

/**
 * Creates only missing draft definitions. Bootstrap intentionally does not
 * activate definitions or amend existing versions, preserving business review.
 */
export async function bootstrapCanonicalMetricDefinitions() {
  let createdDefinitions = 0;
  for (const definition of canonicalMetricDefinitions) {
    const existing = await prisma.metric_definitions.findUnique({
      where: { metricCode: definition.metricCode },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.metric_definitions.create({
      data: {
        metricCode: definition.metricCode,
        metricName: definition.metricName,
        domain: definition.domain,
        category: definition.category,
        ownerDeptId: null,
        ownerStatus: 'UNCONFIRMED',
        status: 'DRAFT',
        currentVersion: 1,
        versions: { create: { ...definition.version, version: 1 } },
      },
    });
    createdDefinitions += 1;
  }
  return {
    createdDefinitions,
    totalDefinitions: canonicalMetricDefinitions.length,
  };
}

export { canonicalMetricDefinitions };
