import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const workOrderRequirementModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['status', 'confirmStatus', 'processName'],
  },
  dataScope: {
    strategy: 'none',
  },
  name: 'work-order-requirement',
  prismaDelegate: prisma.work_order_requirements,
  schemas: {
    create: z.object({}).passthrough(),
    list: z.object({}).passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
