import { z } from 'zod';
import { defineModule } from '~/core/module-registry';
import prisma from '~/utils/prisma';

export const supplierModule = defineModule({
  audit: {
    enabled: true,
    trackedFields: ['status', 'rating', 'qualityScore'],
  },
  dataScope: {
    applyWhere: async (where, ctx) => {
      if (!ctx.userContext?.userId) {
        return where;
      }
      return where;
    },
    deptField: 'buyer',
    strategy: 'dept',
  },
  governedFields: [
    {
      configKey: 'supplierEntityName',
      field: 'name',
      idField: 'nameId',
    },
    {
      configKey: 'supplierProductName',
      field: 'productName',
      idField: 'productNameId',
    },
    {
      configKey: 'supplierProject',
      field: 'project',
      idField: 'projectId',
    },
    {
      configKey: 'supplierCategory',
      field: 'category',
      idField: 'categoryId',
    },
  ],
  name: 'supplier',
  prismaDelegate: prisma.suppliers,
  schemas: {
    create: z
      .object({
        address: z.string().trim().optional(),
        brand: z.string().trim().optional(),
        buyer: z.string().trim().optional(),
        category: z.string().trim().optional(),
        contact: z.string().trim().optional(),
        email: z.string().trim().optional(),
        name: z.string().trim().optional(),
        origin: z.string().trim().optional(),
        outsourcingMode: z.string().trim().optional(),
        phone: z.string().trim().optional(),
        project: z.string().trim().optional(),
        productName: z.string().trim().optional(),
        score2025: z.union([z.number(), z.string()]).optional(),
        status: z.string().trim().optional(),
      })
      .passthrough(),
    list: z
      .object({
        category: z.string().trim().optional(),
        keyword: z.string().trim().optional(),
        name: z.string().trim().optional(),
        outsourcingMode: z.string().trim().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
        sortBy: z.string().trim().optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
        status: z.string().trim().optional(),
      })
      .passthrough(),
    update: z
      .object({
        address: z.string().trim().optional(),
        brand: z.string().trim().optional(),
        buyer: z.string().trim().optional(),
        category: z.string().trim().optional(),
        contact: z.string().trim().optional(),
        email: z.string().trim().optional(),
        name: z.string().trim().optional(),
        origin: z.string().trim().optional(),
        outsourcingMode: z.string().trim().optional(),
        phone: z.string().trim().optional(),
        project: z.string().trim().optional(),
        productName: z.string().trim().optional(),
        score2025: z.union([z.number(), z.string()]).optional(),
        status: z.string().trim().optional(),
      })
      .passthrough(),
  },
  softDelete: true,
});
