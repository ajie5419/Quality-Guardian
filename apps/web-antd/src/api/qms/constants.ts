/**
 * QMS API Path Constants
 */
export const QMS_IMPORT_TIMEOUT = 120_000;

export const QMS_API = {
  // Dashboard
  DASHBOARD: '/qms/dashboard',
  PASS_RATE_TREND: '/qms/pass-rate-trend',
  QUALITY_LOSS_TREND: '/qms/quality-loss-trend',
  VEHICLE_FAILURE_RATE: '/qms/vehicle-failure-rate',
  VEHICLE_FAILURE_RATE_MANUAL: '/qms/vehicle-failure-rate-manual',
  DASHBOARD_TARGETS: '/qms/dashboard/targets',

  // Supplier & Outsourcing
  SUPPLIER: '/qms/supplier',
  SUPPLIER_BATCH: '/qms/supplier/batch',
  SUPPLIER_BATCH_DELETE: '/qms/supplier/batch-delete',
  WELDER: '/qms/welder',

  // Inspection & Quality
  INSPECTION_ISSUES: '/qms/inspection/issues',
  INSPECTION_ISSUES_BATCH_DELETE: '/qms/inspection/issues/batch-delete',
  INSPECTION_ISSUES_STATS: '/qms/inspection/issues/stats',
  INSPECTION_ISSUES_CHART_AGGREGATE: '/qms/inspection/issues/chart-aggregate',
  INSPECTION_ISSUES_NC_NUMBER: '/qms/inspection/issues/nc-number',
  INSPECTION_RECORDS: '/qms/inspection/records',
  INSPECTION_RECORDS_BATCH_DELETE: '/qms/inspection/records/batch-delete',
  INSPECTION_ARCHIVE_TASKS: '/qms/inspection/archive-tasks',
  QUALITY_LOSS: '/qms/quality-loss',
  METROLOGY: '/qms/metrology',
  METROLOGY_BATCH_DELETE: '/qms/metrology/batch-delete',
  METROLOGY_EXPORT: '/qms/metrology/export',
  METROLOGY_IMPORT: '/qms/metrology/import',
  METROLOGY_OVERVIEW: '/qms/metrology/overview',
  METROLOGY_TEMPLATE: '/qms/metrology/template',
  METROLOGY_CALIBRATION_PLAN: '/qms/metrology/calibration-plan',
  METROLOGY_CALIBRATION_PLAN_ANNUAL_GRID:
    '/qms/metrology/calibration-plan/annual-grid',
  METROLOGY_CALIBRATION_PLAN_IMPORT: '/qms/metrology/calibration-plan/import',
  METROLOGY_CALIBRATION_PLAN_OVERVIEW:
    '/qms/metrology/calibration-plan/overview',
  METROLOGY_CALIBRATION_PLAN_TEMPLATE:
    '/qms/metrology/calibration-plan/template',
  METROLOGY_BORROW: '/qms/metrology/borrow',
  METROLOGY_BORROW_MATCH: '/qms/metrology/borrow/match',
  METROLOGY_BORROW_OVERVIEW: '/qms/metrology/borrow/overview',
  PUBLIC_METROLOGY_BORROW: '/qms/public/metrology/borrow',
  PUBLIC_METROLOGY_BORROW_MATCH: '/qms/public/metrology/borrow/match',
  WORK_ORDER: '/qms/work-order',
  WORK_ORDER_REQUIREMENT_BOARD: '/qms/work-order/requirement-board',
  WORK_ORDER_REQUIREMENT_OVERVIEW: '/qms/work-order/requirement-overview',
  WORK_ORDER_REQUIREMENTS: '/qms/work-order/requirements',
  WORKSPACE: '/qms/workspace',
  WORKSPACE_WORK_ORDER_AGGREGATE: '/qms/workspace/work-order-aggregate',
  WORK_ORDER_STATS: '/qms/work-order/stats',
  WORK_ORDER_BATCH_DELETE: '/qms/work-order/batch-delete',
  WORK_ORDER_IMPORT: '/qms/work-order/import',

  // After Sales
  AFTER_SALES: '/qms/after-sales',
  AFTER_SALES_BATCH_DELETE: '/qms/after-sales/batch-delete',
  VEHICLE_COMMISSIONING_ISSUES: '/qms/vehicle-commissioning/issues',
  VEHICLE_COMMISSIONING_REPORTS: '/qms/vehicle-commissioning/reports',

  // Planning & Knowledge
  PLANNING_DFMEA: '/qms/planning/dfmea',
  PLANNING_BOM: '/qms/planning/bom',
  PLANNING_ITP: '/qms/planning/itp',
  PLANNING_ITP_IMPORT: '/qms/planning/itp/import',
  AI_GENERATE_ITP: '/qms/ai/generate-itp',
  AI_EXTRACT_TAGS: '/qms/ai/extract-tags',
  KNOWLEDGE: '/qms/knowledge',
  KNOWLEDGE_CATEGORIES: '/qms/knowledge/categories',

  // Reports
  REPORTS: '/qms/reports',
  REPORTS_SUMMARY: '/qms/reports/summary',
  REPORTS_DAILY: '/qms/reports/daily-summary',
} as const;
