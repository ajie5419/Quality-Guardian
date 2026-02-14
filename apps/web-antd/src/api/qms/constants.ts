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
  DASHBOARD_TARGETS: '/qms/dashboard/targets',

  // Supplier & Outsourcing
  SUPPLIER: '/qms/supplier',
  SUPPLIER_BATCH: '/qms/supplier/batch',
  SUPPLIER_BATCH_DELETE: '/qms/supplier/batch-delete',

  // Inspection & Quality
  INSPECTION_ISSUES: '/qms/inspection/issues',
  INSPECTION_ISSUES_BATCH_DELETE: '/qms/inspection/issues/batch-delete',
  INSPECTION_ISSUES_STATS: '/qms/inspection/issues/stats',
  INSPECTION_ISSUES_NC_NUMBER: '/qms/inspection/issues/nc-number',
  INSPECTION_RECORDS: '/qms/inspection/records',
  INSPECTION_RECORDS_BATCH_DELETE: '/qms/inspection/records/batch-delete',
  QUALITY_LOSS: '/qms/quality-loss',
  WORK_ORDER: '/qms/work-order',
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
