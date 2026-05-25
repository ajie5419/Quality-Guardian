import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const metrologyBorrowModuleName = 'metrology-borrow';

export const metrologyBorrowModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: [],
  },
  dataScope: {
    strategy: 'dept',
  },
  name: metrologyBorrowModuleName,
  prismaDelegate:
    prisma.metrology_borrow_records as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z.object({}).passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
