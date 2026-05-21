/**
 * QMS dictionary type whitelist.
 * Keep this as the single source of truth for backend/frontend/CI checks.
 */
export const QMS_DICTIONARY_TYPES = [
  'after_sales_status',
  'defect_subtype',
  'defect_type',
  'inspection_issue_status',
  'inspection_process_name',
  'metrology_inspection_status',
  'planning_project_status',
  'quality_loss_status',
  'quality_loss_type',
  'supplier_status',
  'supervision_issue_status',
  'supervision_project_status',
  'team',
] as const;

export type QmsDictionaryType = (typeof QMS_DICTIONARY_TYPES)[number];

export const QMS_DICTIONARY_TYPE_LABELS: Record<QmsDictionaryType, string> = {
  after_sales_status: 'After Sales Status',
  defect_subtype: 'Defect Subtype',
  defect_type: 'Defect Type',
  inspection_issue_status: 'Inspection Issue Status',
  inspection_process_name: 'Inspection Process Name',
  metrology_inspection_status: 'Metrology Inspection Status',
  planning_project_status: 'Planning Project Status',
  quality_loss_status: 'Quality Loss Status',
  quality_loss_type: 'Quality Loss Type',
  supplier_status: 'Supplier Status',
  supervision_issue_status: 'Supervision Issue Status',
  supervision_project_status: 'Supervision Project Status',
  team: 'Team',
};

export const QMS_DICTIONARY_TYPE_OPTIONS = QMS_DICTIONARY_TYPES.map(
  (value) => ({
    label: QMS_DICTIONARY_TYPE_LABELS[value],
    value,
  }),
);

export const QMS_DICTIONARY_TYPE_KEYS = {
  afterSalesStatus: 'after_sales_status',
  defectSubtype: 'defect_subtype',
  defectType: 'defect_type',
  inspectionIssueStatus: 'inspection_issue_status',
  inspectionProcessName: 'inspection_process_name',
  metrologyInspectionStatus: 'metrology_inspection_status',
  planningProjectStatus: 'planning_project_status',
  qualityLossStatus: 'quality_loss_status',
  qualityLossType: 'quality_loss_type',
  supplierStatus: 'supplier_status',
  supervisionIssueStatus: 'supervision_issue_status',
  supervisionProjectStatus: 'supervision_project_status',
  team: 'team',
} as const satisfies Record<string, QmsDictionaryType>;
