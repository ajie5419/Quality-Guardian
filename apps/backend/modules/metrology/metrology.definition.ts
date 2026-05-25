import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const metrologyModuleName = 'metrology';

export const metrologyModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: [],
  },
  dataScope: {
    strategy: 'dept',
  },
  name: metrologyModuleName,
  prismaDelegate: prisma.measuring_instruments as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z.object({}).passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
