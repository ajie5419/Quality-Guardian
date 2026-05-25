import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const dictionaryModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['dictType', 'dictKey', 'dictValue', 'status'],
  },
  dataScope: {
    strategy: 'none',
  },
  name: 'dictionary',
  prismaDelegate: prisma.dictionaries,
  schemas: {
    create: z.object({}).passthrough(),
    list: z.object({}).passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
