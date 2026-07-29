import type { H3Event } from 'h3';

import { ProcessMasterService } from '~/modules/process-master';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export async function bom_process_options_get(event: H3Event) {
  try {
    const processes = await ProcessMasterService.listActiveOptions();
    return useResponseSuccess(
      processes.map((process) => ({
        label: process.name,
        value: process.id,
      })),
    );
  } catch (error) {
    logApiError('bom-process-options', error, undefined, event);
    return internalServerErrorResponse(event, 'Failed to load process options');
  }
}
