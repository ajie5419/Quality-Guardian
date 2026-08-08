import type { SupplierIdentityInput } from './supplier-identity.service';

import { z } from 'zod';

const rawSupplierIdentityInputSchema = z.object({
  supplierId: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
});

export const supplierIdentityInputSchema = {
  parse(input: unknown): SupplierIdentityInput {
    const parsed = rawSupplierIdentityInputSchema.parse(input);
    const supplierId = String(parsed.supplierId || '').trim();
    const teamId = String(parsed.teamId || '').trim();
    if (!supplierId || !teamId) {
      throw new z.ZodError([]);
    }
    return { supplierId, teamId };
  },
};

export const supplierIdentityOptionsQuerySchema = z.object({
  keyword: z.string().trim().max(100).optional(),
  take: z.coerce.number().int().positive().max(100).default(100),
});

export type SupplierIdentityOptionsQuery = z.infer<
  typeof supplierIdentityOptionsQuerySchema
>;
