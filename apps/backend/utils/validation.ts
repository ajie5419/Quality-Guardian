import type { H3Event } from 'h3';
import type { ZodType } from 'zod';

import { createError, readBody } from 'h3';

export async function parseBody<T extends ZodType>(
  event: H3Event,
  schema: T,
): Promise<ReturnType<T['parse']>> {
  const body = await readBody(event);
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message || '参数校验失败';
    throw createError({ statusCode: 400, statusMessage: message });
  }
  return result.data;
}
