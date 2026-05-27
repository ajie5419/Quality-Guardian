import {
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from './inspection-request';

export function failCloseRequest(prefix: string, message: string): never {
  throw new Error(`${prefix}:${message}`);
}

export function parseCloseRequestNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validateCloseRequestBody(body: Record<string, unknown>) {
  const result = normalizeInspectionRequestText(body.result).toUpperCase();
  if (result !== 'PASS' && result !== 'FAIL')
    failCloseRequest('VALIDATION', '检验结果必须为合格或不合格');
  const closeAttachments = normalizeInspectionRequestAttachments(
    body.attachments,
  );
  if (closeAttachments.length === 0)
    failCloseRequest('VALIDATION', '检验记录不能为空');
  const quantity = parseInspectionRequestQuantity(body.quantity);
  const rawUnqualifiedQuantity = parseCloseRequestNumber(
    body.unqualifiedQuantity,
    result === 'FAIL' ? quantity : 0,
  );
  const unqualifiedQuantity = Math.max(
    0,
    Math.min(quantity, rawUnqualifiedQuantity),
  );
  if (result === 'PASS' && unqualifiedQuantity > 0)
    failCloseRequest('VALIDATION', '检验结果为合格时，不合格数量必须为 0');
  if (result !== 'FAIL') return;
  if (unqualifiedQuantity <= 0)
    failCloseRequest(
      'VALIDATION',
      '检验结果为不合格时，不合格数量必须大于 0',
    );
  if (!body.linkedIssue || typeof body.linkedIssue !== 'object')
    failCloseRequest('VALIDATION', '检验结果为不合格时必须填写不合格项信息');
  const linkedIssue = body.linkedIssue as Record<string, unknown>;
  for (const [key, label] of [
    ['partName', '组件名称'],
    ['processName', '工序'],
    ['responsibleDepartment', '责任部门'],
    ['defectType', '缺陷分类'],
    ['defectSubtype', '二级分类'],
    ['severity', '严重程度'],
    ['status', '状态'],
    ['description', '不合格描述'],
    ['rootCause', '原因分析'],
    ['solution', '解决方案'],
  ] as const) {
    requireLinkedIssueText(linkedIssue, key, label);
  }
}

function requireLinkedIssueText(
  linkedIssue: Record<string, unknown>,
  key: string,
  label: string,
) {
  if (!normalizeInspectionRequestText(linkedIssue[key])) {
    failCloseRequest('VALIDATION', `不合格项${label}不能为空`);
  }
}
