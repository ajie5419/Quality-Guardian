import { createModuleLogger } from '~/utils/logger';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

const logger = createModuleLogger('inspection-request-create-retry');

function isRequestNoConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;
  const message = String((error as { message?: string })?.message || '');
  const target: unknown = (error as { meta?: { target?: unknown } })?.meta
    ?.target;
  const targetStr = Array.isArray(target)
    ? target.join(',')
    : String(target ?? '');
  return message.includes('requestNo') || targetStr.includes('requestNo');
}

export async function retryInspectionRequestCreate<T>(run: () => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      logger.error(
        { err: error },
        'inspection request create transaction failed',
      );
      if (attempt >= 3 || !isRequestNoConflict(error)) throw error;
    }
  }
}
