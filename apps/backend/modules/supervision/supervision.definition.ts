import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const supervisionModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['status', 'projectType', 'supplierName'],
  },
  dataScope: {
    strategy: 'dept',
  },
  name: 'supervision',
  prismaDelegate: prisma.supervision_projects as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z
      .object({
        keyword: z.string().trim().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
        projectType: z.string().trim().optional(),
        status: z.string().trim().optional(),
        supplierName: z.string().trim().optional(),
      })
      .passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
