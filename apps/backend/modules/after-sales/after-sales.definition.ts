import type { QmsPrismaDelegate } from '~/core/module-registry';

import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const afterSalesModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['claimStatus', 'respDept', 'feedbackDept', 'supplierBrand'],
  },
  dataScope: {
    strategy: 'dept',
  },
  governedFields: [
    { configKey: 'defectType', field: 'defectType', idField: 'defectTypeId' },
    {
      configKey: 'defectSubtype',
      field: 'defectSubtype',
      idField: 'defectSubtypeId',
    },
    { configKey: 'division', field: 'division', idField: 'divisionId' },
    {
      configKey: 'responsibleDepartment',
      field: 'respDept',
      idField: 'respDeptId',
    },
    {
      configKey: 'supplierBrand',
      field: 'supplierBrand',
      idField: 'supplierBrandId',
    },
    { configKey: 'projectName', field: 'projectName', idField: 'projectId' },
    { configKey: 'partName', field: 'partName', idField: 'partId' },
  ],
  name: 'after-sales',
  prismaDelegate: prisma.after_sales as unknown as QmsPrismaDelegate,
  schemas: {
    create: z.object({}).passthrough(),
    list: z
      .object({
        dateMode: z.string().trim().optional(),
        dateValue: z.string().trim().optional(),
        keyword: z.string().trim().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
        status: z.string().trim().optional(),
        year: z.coerce.number().int().optional(),
      })
      .passthrough(),
    update: z.object({}).passthrough(),
  },
  softDelete: true,
});
