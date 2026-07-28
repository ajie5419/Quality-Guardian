import type { H3Event } from 'h3';

import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export async function bom_process_options_get(event: H3Event) {
  try {
    const processes = await prisma.processes.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
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
