import { z } from 'zod';

import {
  isInspectionRequestAssemblyProcess,
  normalizeInspectionRequestAttachments,
  normalizeInspectionRequestText,
  parseInspectionRequestQuantity,
} from './inspection-request';

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
  team: z.string().optional(),
  workOrderNumber: z.string().optional(),
});

export type InspectionRequestCreateBody = z.infer<
  typeof inspectionRequestCreateBodySchema
>;

export function validateInspectionRequestCreateBody(
  body: InspectionRequestCreateBody,
) {
  const workOrderNumber = normalizeInspectionRequestText(body.workOrderNumber);
  const partName = normalizeInspectionRequestText(body.partName);
  const processName = normalizeInspectionRequestText(body.processName);
  const componentName = isInspectionRequestAssemblyProcess(processName)
    ? ''
    : normalizeInspectionRequestText(body.componentName);
  const reporter = normalizeInspectionRequestText(body.reporter);
  const team = normalizeInspectionRequestText(body.team);
  parseInspectionRequestQuantity(body.quantity);
  const attachments = normalizeInspectionRequestAttachments(body.attachments);

  return {
    attachments,
    componentName,
    isValid:
      Boolean(workOrderNumber) &&
      Boolean(partName) &&
      Boolean(processName) &&
      (isInspectionRequestAssemblyProcess(processName) ||
        Boolean(componentName)) &&
      Boolean(team) &&
      Boolean(reporter) &&
      attachments.length > 0,
    partName,
    processName,
    reporter,
    team,
    workOrderNumber,
  };
}
