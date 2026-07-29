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
  inspectionRequestCreateBodySchema.extend({
    category: z.enum(['INCOMING', 'PROCESS']),
    partId: z.string().trim().min(1),
    processId: z.string().trim().min(1),
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
  return {
    attachments,
    isValid:
      workOrderNumbers.length > 0 &&
      Boolean(normalizeInspectionRequestText(body.partId)) &&
      Boolean(normalizeInspectionRequestText(body.processId)) &&
      Boolean(normalizeInspectionRequestText(body.reporter)) &&
      Boolean(
        normalizeInspectionRequestText(
          isIncoming ? body.supplierId : body.teamId,
        ),
      ) &&
      attachments.length > 0,
    workOrderNumber:
      normalizeInspectionRequestText(body.workOrderNumber) ||
      workOrderNumbers[0] ||
      '',
    workOrderNumbers,
  };
}
