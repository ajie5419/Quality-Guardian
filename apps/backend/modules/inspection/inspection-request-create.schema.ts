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
  componentName: z.string().optional(),
  mutualCheckResult: z.string().optional(),
  partName: z.string().optional(),
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
  const processName = normalizeInspectionRequestText(body.processName);
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
    processName,
    reporter,
    supplierId,
    team,
    teamId,
    workOrderNumber,
    workOrderNumbers,
  };
}
