const entityLabels: Record<string, string> = {
  after_sales: '售后记录',
  inspections: '检验记录',
  project_boms: 'BOM 物料',
  qms_inspection_requests: '报检任务',
  quality_records: '不合格项',
  supplier_identity_links: '供应商身份关联',
  work_order_requirements: '工单要求',
  work_orders: '工单',
};

const fieldLabels: Record<string, string> = {
  defectClassification: '缺陷分类',
  divisionId: '事业部',
  inspectionId: '检验记录',
  partId: '物料',
  processId: '工序',
  productClassification: '产品分类',
  projectId: '项目',
  requiredProcessIds: '所需工序',
  respDeptId: '责任部门',
  responsibleDepartmentId: '责任部门',
  supplierId: '供应商',
  teamId: '班组',
};

const reasonLabels: Record<string, string> = {
  AMBIGUOUS_CANONICAL_NAME: '匹配到多个主数据',
  AMBIGUOUS_DEPARTMENT_NAME: '部门名称无法唯一确定',
  classification_pair_not_found: '未找到对应的分类组合',
  CONFLICTING_DEPARTMENT_IDENTITY: '部门身份信息冲突',
  CONFLICTING_IDENTITY: '身份信息冲突',
  CONFLICTING_SUPPLIER_IDENTITY: '供应商身份信息冲突',
  DIVISION_IDENTITY_NOT_RESOLVED: '事业部身份未解析',
  INVALID_EXISTING_ID: '已有主数据 ID 无效',
  MISSING_CANONICAL_DEPARTMENT: '缺少规范部门',
  MISSING_PROCESS_TEAM_LINK: '缺少班组与供应商关联',
  NO_ACTIVE_CANONICAL_MATCH: '未找到启用的主数据',
  NO_EXACT_CANONICAL_MATCH: '未找到精确匹配的主数据',
  NO_IDENTITY_EVIDENCE: '缺少可用的身份依据',
  NO_MATCH: '未找到匹配项',
  supplier_identity_conflict: '供应商身份信息冲突',
  supplier_identity_not_resolved: '供应商身份未解析',
  team_identity_conflict: '班组身份信息冲突',
  team_identity_not_resolved: '班组身份未解析',
  UNKNOWN_DIVISION_REFERENCE: '未知的事业部引用',
};

const statusLabels: Record<string, string> = {
  IGNORED: '已忽略',
  OPEN: '待处置',
  RESOLVED: '已解决',
};

function resolveLabel(labels: Record<string, string>, value: unknown) {
  const normalized = String(value || '').trim();
  if (!normalized) return '—';
  return labels[normalized] || `未知项（${normalized}）`;
}

export const governanceEntityOptions = Object.entries(entityLabels).map(
  ([value, label]) => ({ label, value }),
);

export const governanceFieldOptions = Object.entries(fieldLabels).map(
  ([value, label]) => ({ label, value }),
);

export function getGovernanceEntityLabel(value: unknown) {
  return resolveLabel(entityLabels, value);
}

export function getGovernanceFieldLabel(value: unknown) {
  return resolveLabel(fieldLabels, value);
}

export function getGovernanceReasonLabel(value: unknown) {
  return resolveLabel(reasonLabels, value);
}

export function getGovernanceStatusLabel(value: unknown) {
  return resolveLabel(statusLabels, value);
}
