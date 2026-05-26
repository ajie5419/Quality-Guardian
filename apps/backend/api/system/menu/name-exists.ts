import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { z } from 'zod';
import { RbacService } from '~/modules/rbac/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { useResponseError, useResponseSuccess } from '~/utils/response';

const schema = z.object({ name: z.string().trim().min(1) });

export default defineEventHandler(async (event) => {
  try {
    const parsed = schema.safeParse(await readBody(event));
    if (!parsed.success) {
      setResponseStatus(event, 400);
      return useResponseError('name is required');
    }
    return useResponseSuccess(
      !!(await RbacService.checkMenuNameExists(parsed.data.name)),
    );
  } catch (error) {
    logApiError('menu-name-exists', error, undefined, event);
    setResponseStatus(event, 500);
    return useResponseError('Failed to validate menu name');
  }
});
