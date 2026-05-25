import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const metrologyCalibrationPlanModuleName = 'metrology-calibration-plan';

export const metrologyCalibrationPlanModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: [],
  },
  dataScope: {
    strategy: 'dept',
  },
  name: metrologyCalibrationPlanModuleName,
  prismaDelegate:
    prisma.metrology_calibration_plans as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z.object({}).passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
