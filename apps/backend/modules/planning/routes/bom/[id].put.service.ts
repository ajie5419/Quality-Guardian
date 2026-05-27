import type { H3Event } from 'h3';

import {
  buildProjectBomMutableData,
  mapProjectBomItem,
  projectBomItemSelect,
} from '~/modules/planning/bom';
import { logApiError } from '~/utils/api-logger';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function bom_id_put(event: H3Event) {
  await awaitMockDelay();
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const mutablePayload = buildProjectBomMutableData(body);
    const governedBomPayload = buildGovernedWriteFieldsForTable(
      'project_boms',
      mutablePayload,
    );
    const updated = await prisma.project_boms.update({
      where: { id },
      data: {
        ...mutablePayload,
        ...governedBomPayload,
      },
      select: projectBomItemSelect,
    });

    return useResponseSuccess(mapProjectBomItem(updated));
  } catch (error) {
    logApiError('bom', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'BOM item not found');
    }
    return internalServerErrorResponse(event, '更新 BOM 条目失败');
  }
}
