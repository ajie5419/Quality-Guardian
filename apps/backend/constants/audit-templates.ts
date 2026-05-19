const AUDIT_TEMPLATE_PLACEHOLDER_REGEX = /\{\{\s*(\w+)\s*\}\}/g;

export const AUDIT_TEMPLATES = {
  AFTER_SALES_SOFT_DELETE: 'Soft deleted after-sales record',
  INSPECTION_ISSUE_SOFT_DELETE: 'Soft deleted inspection issue record',
  QUALITY_LOSS_BATCH_SOFT_DELETE:
    'Batch soft deleted {{count}} quality loss records',
  QUALITY_LOSS_SOFT_DELETE: 'Soft deleted quality loss record',
  VEHICLE_COMMISSIONING_ISSUE_CREATE: '创建调试验收问题: {{issue}}',
  VEHICLE_COMMISSIONING_ISSUE_UPDATE:
    '更新调试验收问题: {{issue}}, 状态={{status}}',
} as const;

type AuditTemplateId = keyof typeof AUDIT_TEMPLATES;

type AuditTemplateVariablesMap = {
  AFTER_SALES_SOFT_DELETE: Record<string, never>;
  INSPECTION_ISSUE_SOFT_DELETE: Record<string, never>;
  QUALITY_LOSS_BATCH_SOFT_DELETE: { count: number };
  QUALITY_LOSS_SOFT_DELETE: Record<string, never>;
  VEHICLE_COMMISSIONING_ISSUE_CREATE: { issue: string };
  VEHICLE_COMMISSIONING_ISSUE_UPDATE: { issue: string; status: string };
};

function stringifyAuditVariable(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Render template text using {{variable}} placeholders.
 */
export function renderAuditTemplateText(
  template: string,
  variables: Record<string, unknown> = {},
): string {
  return template.replaceAll(
    AUDIT_TEMPLATE_PLACEHOLDER_REGEX,
    (_placeholder, key: string) => {
      const value = variables[key];
      return stringifyAuditVariable(value);
    },
  );
}

/**
 * Build audit details from predefined templates to avoid ad-hoc string joins.
 */
export function renderAuditTemplate<T extends AuditTemplateId>(
  templateId: T,
  variables: AuditTemplateVariablesMap[T],
): string {
  return renderAuditTemplateText(
    AUDIT_TEMPLATES[templateId],
    variables as Record<string, unknown>,
  );
}
