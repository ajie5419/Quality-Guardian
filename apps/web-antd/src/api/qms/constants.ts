/**
 * QMS API Path Constants
 */
export const QMS_API = {
  // Dashboard
  DASHBOARD: '/qms/dashboard',
  PASS_RATE_TREND: '/qms/pass-rate-trend',
  QUALITY_LOSS_TREND: '/qms/quality-loss-trend',
  VEHICLE_FAILURE_RATE: '/qms/vehicle-failure-rate',

  // Supplier & Outsourcing
  SUPPLIER: '/qms/supplier',
  SUPPLIER_BATCH: '/qms/supplier/batch',
  SUPPLIER_BATCH_DELETE: '/qms/supplier/batch-delete',

  // Inspection & Quality
  INSPECTION_ISSUES: '/qms/inspection/issues',
  INSPECTION_RECORDS: '/qms/inspection/records',
  QUALITY_LOSS: '/qms/quality-loss',
  WORK_ORDER: '/qms/work-order',

  // Planning & Knowledge
  PLANNING_DFMEA: '/qms/planning/dfmea',
  PLANNING_BOM: '/qms/planning/bom',
  PLANNING_ITP: '/qms/planning/itp',
  PLANNING_ITP_IMPORT: '/qms/planning/itp/import',
  AI_GENERATE_ITP: '/qms/ai/generate-itp',
  KNOWLEDGE: '/qms/knowledge',
  KNOWLEDGE_CATEGORIES: '/qms/knowledge/categories',

  // Reports
  REPORTS: '/qms/reports',
  REPORTS_SUMMARY: '/qms/reports/summary',
  REPORTS_DAILY: '/qms/reports/daily-summary',
} as const;
