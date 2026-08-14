import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { z } from 'zod';
import { BusinessError } from '~/utils/business-error';

import {
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from './inspection-request';

const PREFIX_STATUS_MAP: Record<string, number> = {
  VALIDATION: 400,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INTERNAL: 500,
};

function buildCloseResponsibilitySchema(
  messages: {
    departmentIdRequired: string;
    externalSupplierRequired: string;
    internalSupplierForbidden: string;
  },
  requireGenerateNcNumber = false,
) {
  return z
    .object({
      ...(requireGenerateNcNumber
        ? {
            generateNcNumber: z.boolean({
              required_error: '是否生成不合格编号不能为空',
            }),
          }
        : {}),
      responsibilityType: z.preprocess(
        (value) => normalizeInspectionIssueResponsibilityType(value) || value,
        z.nativeEnum(INSPECTION_ISSUE_RESPONSIBILITY_TYPE),
      ),
      responsibleDepartmentId: z.string().trim().optional(),
      supplierId: z.string().trim().min(1).optional(),
    })
    .passthrough()
    .superRefine((value, context) => {
      const responsibleDepartmentId = normalizeInspectionRequestText(
        value.responsibleDepartmentId,
      );
      if (
        value.responsibilityType ===
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT
      ) {
        if (responsibleDepartmentId) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: '外协责任部门由系统配置解析',
            path: ['responsibleDepartmentId'],
          });
        }
      } else if (
        value.responsibilityType ===
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT &&
        !responsibleDepartmentId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.departmentIdRequired,
          path: ['responsibleDepartmentId'],
        });
      }
      if (
        value.responsibilityType ===
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT &&
        value.supplierId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.internalSupplierForbidden,
          path: ['supplierId'],
        });
      }
      if (
        value.responsibilityType !==
          INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT &&
        !value.supplierId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.externalSupplierRequired,
          path: ['supplierId'],
        });
      }
    });
}

const closeResponsibilitySchema = buildCloseResponsibilitySchema({
  departmentIdRequired: '关闭责任部门 ID 不能为空',
  externalSupplierRequired: '关闭外部责任单位缺少 canonical 供应商 ID',
  internalSupplierForbidden: '关闭内部责任部门不能同时指定供应商 ID',
});

const linkedIssueResponsibilitySchema = buildCloseResponsibilitySchema(
  {
    departmentIdRequired: '不合格项责任部门 ID 不能为空',
    externalSupplierRequired: '外部责任单位缺少 canonical 供应商 ID',
    internalSupplierForbidden: '内部责任部门不能同时指定供应商 ID',
  },
  true,
);

export function failCloseRequest(prefix: string, message: string): never {
  const httpStatus = PREFIX_STATUS_MAP[prefix] ?? 400;
  throw new BusinessError(prefix, message, httpStatus);
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
  if (result === 'PASS' && closeAttachments.length === 0)
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
  if (body.responsibility !== undefined) {
    const responsibilityResult = closeResponsibilitySchema.safeParse(
      body.responsibility,
    );
    if (!responsibilityResult.success) {
      failCloseRequest(
        'VALIDATION',
        responsibilityResult.error.issues[0]?.message || '关闭责任归属参数无效',
      );
    }
  }
  if (result !== 'FAIL') return;
  if (unqualifiedQuantity <= 0)
    failCloseRequest('VALIDATION', '检验结果为不合格时，不合格数量必须大于 0');
  if (!body.linkedIssue || typeof body.linkedIssue !== 'object')
    failCloseRequest('VALIDATION', '检验结果为不合格时必须填写不合格项信息');
  const linkedIssue = body.linkedIssue as Record<string, unknown>;
  const responsibilityResult =
    linkedIssueResponsibilitySchema.safeParse(linkedIssue);
  if (!responsibilityResult.success) {
    failCloseRequest(
      'VALIDATION',
      responsibilityResult.error.issues[0]?.message ||
        '不合格项责任归属参数无效',
    );
  }
  const issuePhotos = normalizeIssuePhotoUrls(linkedIssue.photos);
  if (issuePhotos.length === 0)
    failCloseRequest('VALIDATION', '不合格项照片不能为空');
  for (const [key, label] of [
    ['partName', '组件名称'],
    ['processName', '工序'],
    ['defectCategoryId', '缺陷分类'],
    ['defectSubcategoryId', '二级分类'],
    ['severity', '严重程度'],
    ['status', '状态'],
    ['description', '不合格描述'],
    ['rootCause', '原因分析'],
    ['solution', '解决方案'],
  ] as const) {
    requireLinkedIssueText(linkedIssue, key, label);
  }
}

function normalizeIssuePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => {
          if (typeof item === 'string')
            return normalizeInspectionRequestText(item);
          if (!item || typeof item !== 'object') return '';
          return normalizeInspectionRequestText(
            (item as Record<string, unknown>).url,
          );
        })
        .filter(Boolean),
    ),
  ];
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
