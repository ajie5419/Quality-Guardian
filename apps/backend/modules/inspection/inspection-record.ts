import { z } from 'zod';

const queryValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.number(),
  z.boolean(),
]);

export const inspectionRecordListQuerySchema = z
  .object({
    componentName: queryValueSchema.optional(),
    endDate: queryValueSchema.optional(),
    hasDocuments: queryValueSchema.optional(),
    inspector: queryValueSchema.optional(),
    keyword: queryValueSchema.optional(),
    level1Component: queryValueSchema.optional(),
    materialName: queryValueSchema.optional(),
    page: queryValueSchema.optional(),
    pageSize: queryValueSchema.optional(),
    processName: queryValueSchema.optional(),
    projectName: queryValueSchema.optional(),
    sourceInspectionId: queryValueSchema.optional(),
    startDate: queryValueSchema.optional(),
    supplierName: queryValueSchema.optional(),
    team: queryValueSchema.optional(),
    type: queryValueSchema.optional(),
    workOrderNumber: queryValueSchema.optional(),
    year: queryValueSchema.optional(),
  })
  .strict();

export {
  buildInspectionRecordDateRange,
  parseInspectionRecordListQuery,
} from '@qgs/shared';
