import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { z } from 'zod';

import {
  INCOMING_INSPECTION_PROCESS_NAME,
  isIncomingInspectionRequestProcess,
  isInspectionRequestAssemblyProcess,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from './inspection-request';
import { normalizeInspectionRequestWorkOrderNumbers } from './inspection-request-work-orders';

export { INCOMING_INSPECTION_PROCESS_NAME };

const inspectionRequestAttachmentSchema = z.object({
  fileId: z.string().optional(),
  name: z.string().optional(),
  originalName: z.string().optional(),
  size: z.union([z.number(), z.string()]).optional(),
  type: z.string().optional(),
  url: z.string().optional(),
});

export const inspectionRequestCreateBodySchema = z.object({
  attachments: z.array(inspectionRequestAttachmentSchema).optional(),
  category: z.enum(['INCOMING', 'PROCESS']).optional(),
  componentName: z.string().optional(),
  mutualCheckResult: z.string().optional(),
  partId: z.string().trim().optional(),
  partName: z.string().optional(),
  processId: z.string().trim().optional(),
  processName: z.string().optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  reporter: z.string().optional(),
  responsibilityType: z.preprocess(
    (value) => normalizeInspectionIssueResponsibilityType(value) ?? undefined,
    z
      .enum([
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
      ])
      .optional(),
  ),
  responsibleDepartmentId: z.string().trim().optional(),
  requestedPartName: z.string().trim().optional(),
  requestInfo: z.string().optional(),
  selfCheckResult: z.string().optional(),
  supplierId: z.string().trim().optional(),
  stationSelection: z
    .object({
      indexes: z.array(z.union([z.number(), z.string()])).optional(),
      mode: z.string(),
    })
    .optional(),
  team: z.string().optional(),
  teamId: z.string().trim().optional(),
  workOrderNumber: z.string().optional(),
  workOrderNumbers: z.array(z.string()).optional(),
});

export const inspectionRequestCreateV2BodySchema =
  inspectionRequestCreateBodySchema
    .extend({
      category: z.enum(['INCOMING', 'PROCESS']),
      partId: z.string().trim().min(1).optional(),
      processId: z.string().trim().min(1),
      requestedPartName: z.string().trim().min(1).max(191).optional(),
      responsibilityType: z.enum([
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT,
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER,
      ]),
      responsibleDepartmentId: z.string().trim().min(1),
    })
    .superRefine((body, context) => {
      const hasPartId = Boolean(body.partId);
      const hasRequestedName = Boolean(body.requestedPartName);
      if (body.category === 'PROCESS' && !hasPartId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'partId is required for process inspection requests',
          path: ['partId'],
        });
      }
      if (body.category === 'PROCESS' && hasRequestedName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'requestedPartName is only allowed for incoming inspection requests',
          path: ['requestedPartName'],
        });
      }
      if (body.category === 'INCOMING' && hasPartId === hasRequestedName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Incoming inspection requests require exactly one of partId or requestedPartName',
          path: ['partId'],
        });
      }
      const isInternal =
        body.responsibilityType ===
        INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT;
      const isExternal = !isInternal;
      if (isExternal && !body.supplierId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External responsibility requires supplierId',
          path: ['supplierId'],
        });
      }
      if (isInternal && body.supplierId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Internal responsibility cannot specify supplierId',
          path: ['supplierId'],
        });
      }
      if (isExternal && body.teamId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External responsibility must not depend on teamId',
          path: ['teamId'],
        });
      }
    });

export type InspectionRequestCreateBody = z.infer<
  typeof inspectionRequestCreateBodySchema
>;

export function validateInspectionRequestCreateBody(
  body: InspectionRequestCreateBody,
) {
  const workOrderNumbers = normalizeInspectionRequestWorkOrderNumbers(body);
  const workOrderNumber =
    normalizeInspectionRequestText(body.workOrderNumber) ||
    workOrderNumbers[0] ||
    '';
  const partName = normalizeInspectionRequestText(body.partName);
  const partId = normalizeInspectionRequestText(body.partId);
  const processName = normalizeInspectionRequestText(body.processName);
  const processId = normalizeInspectionRequestText(body.processId);
  const skipsComponentName =
    isInspectionRequestAssemblyProcess(processName) ||
    isIncomingInspectionRequestProcess(processName);
  const componentName = skipsComponentName
    ? ''
    : normalizeInspectionRequestText(body.componentName);
  const reporter = normalizeInspectionRequestText(body.reporter);
  const supplierId = normalizeInspectionRequestText(body.supplierId);
  const team = normalizeInspectionRequestText(body.team);
  const teamId = normalizeInspectionRequestText(body.teamId);
  parseInspectionRequestQuantity(body.quantity);
  const attachments = normalizeInspectionRequestAttachments(body.attachments);

  return {
    attachments,
    componentName,
    isValid:
      workOrderNumbers.length > 0 &&
      Boolean(partName) &&
      Boolean(processName) &&
      (skipsComponentName || Boolean(componentName)) &&
      Boolean(team) &&
      (isIncomingInspectionRequestProcess(processName)
        ? Boolean(supplierId)
        : Boolean(teamId)) &&
      Boolean(reporter) &&
      attachments.length > 0,
    partName,
    partId,
    processName,
    processId,
    reporter,
    supplierId,
    team,
    teamId,
    workOrderNumber,
    workOrderNumbers,
  };
}

export function validateInspectionRequestCreateV2Body(
  body: z.infer<typeof inspectionRequestCreateV2BodySchema>,
) {
  const workOrderNumbers = normalizeInspectionRequestWorkOrderNumbers(body);
  const attachments = normalizeInspectionRequestAttachments(body.attachments);
  const isIncoming = body.category === 'INCOMING';
  const hasPartIdentity = isIncoming
    ? Boolean(normalizeInspectionRequestText(body.partId)) !==
      Boolean(normalizeInspectionRequestText(body.requestedPartName))
    : Boolean(normalizeInspectionRequestText(body.partId));
  return {
    attachments,
    isValid:
      workOrderNumbers.length > 0 &&
      hasPartIdentity &&
      Boolean(normalizeInspectionRequestText(body.processId)) &&
      Boolean(normalizeInspectionRequestText(body.reporter)) &&
      Boolean(normalizeInspectionRequestText(body.responsibleDepartmentId)) &&
      Boolean(normalizeInspectionRequestText(body.responsibilityType)) &&
      (body.responsibilityType ===
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
        ? !normalizeInspectionRequestText(body.supplierId)
        : Boolean(normalizeInspectionRequestText(body.supplierId))) &&
      attachments.length > 0,
    workOrderNumber:
      normalizeInspectionRequestText(body.workOrderNumber) ||
      workOrderNumbers[0] ||
      '',
    workOrderNumbers,
  };
}
