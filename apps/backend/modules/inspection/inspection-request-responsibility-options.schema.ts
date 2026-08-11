import { z } from 'zod';

export const inspectionRequestResponsibilityOptionsQuerySchema = z
  .object({
    keyword: z.string().optional(),
    responsibilityType: z.enum([
      'INTERNAL_DEPARTMENT',
      'OUTSOURCING_UNIT',
      'SUPPLIER',
    ]),
  })
  .required({ responsibilityType: true });
