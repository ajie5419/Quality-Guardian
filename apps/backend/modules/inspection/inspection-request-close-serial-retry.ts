import { logApiWarn } from '~/utils/api-logger';

import { isInspectionSerialNumberConflict } from './inspection-record-types';

/**
 * Retries the whole close transaction when concurrent transactions selected
 * the same next serial number. The close is one atomic unit: a unique-index
 * conflict must re-run it from the state guard, never resume mid-transaction.
 */
export async function retryOnSerialNumberConflict<T>(
  run: () => Promise<T>,
  maxAttempts: number,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= maxAttempts || !isInspectionSerialNumberConflict(error)) {
        throw error;
      }
      logApiWarn(
        'inspection-request-close',
        'serial number conflict, retrying close transaction',
        { attempt, maxAttempts },
      );
    }
  }
}
