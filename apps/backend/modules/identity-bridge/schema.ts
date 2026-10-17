import { z } from 'zod';

const clientId = z.string().min(1).max(128);
const redirectUri = z.string().url().max(512);
const opaque = z.string().regex(/^[\w-]{43}$/);
export const authorizeSchema = z
  .object({
    clientId,
    redirectUri,
    state: z.string().regex(/^[\w-]{43,128}$/),
    challenge: opaque,
    method: z.literal('S256'),
  })
  .strict();
export const exchangeSchema = z
  .object({
    redirectUri,
    code: opaque,
    verifier: z.string().regex(/^[\w.~-]{43,128}$/),
  })
  .strict();
export type AuthorizeInput = z.infer<typeof authorizeSchema>;
export type ExchangeInput = z.infer<typeof exchangeSchema>;
