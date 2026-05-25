import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const workOrderModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['status', 'projectName', 'division'],
  },
  dataScope: {
    strategy: 'personal',
  },
  name: 'work-order',
  prismaDelegate: prisma.work_orders as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z
      .object({
        endDate: z.string().trim().optional(),
        granularity: z.string().trim().optional(),
        ids: z.array(z.string().trim()).optional(),
        ignoreYearFilter: z.coerce.boolean().optional(),
        keyword: z.string().trim().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
        productName: z.string().trim().optional(),
        projectName: z.string().trim().optional(),
        startDate: z.string().trim().optional(),
        status: z.string().trim().optional(),
        workOrderNumber: z.string().trim().optional(),
        year: z.coerce.number().int().optional(),
      })
      .passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
