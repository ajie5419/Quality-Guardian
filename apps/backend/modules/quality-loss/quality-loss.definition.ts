import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const qualityLossModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['status', 'amount', 'actualClaim', 'respDept'],
  },
  dataScope: {
    strategy: 'dept',
  },
  governedFields: [
    {
      configKey: 'responsibleDepartment',
      field: 'respDept',
      idField: 'respDeptId',
    },
    {
      configKey: 'projectName',
      field: 'projectName',
      idField: 'projectId',
    },
    {
      configKey: 'partName',
      field: 'partName',
      idField: 'partId',
    },
    {
      configKey: 'defectSubtype',
      field: 'defectSubtype',
      idField: 'defectSubtypeId',
    },
  ],
  name: 'quality-loss',
  prismaDelegate: prisma.quality_losses as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z
      .object({
        granularity: z.enum(['month', 'week', 'year']).optional(),
        lossSource: z.string().trim().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
        status: z.string().trim().optional(),
        workOrderNumber: z.string().trim().optional(),
        year: z.coerce.number().int().optional(),
      })
      .passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
