import type { H3Event } from 'h3';

import { buildGovernedWriteFieldsForTable } from '~/governance/master-data/master-data-governance-write';
import { buildDfmeaProjectUpdateData } from '~/modules/planning/dfmea';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import { getRequiredRouterParam } from '~/utils/route-param';

export async function dfmea_projects_id_put(event: H3Event) {
  await awaitMockDelay();
  const id = getRequiredRouterParam(event, 'id', 'ID required');
  if (typeof id !== 'string') {
    return id;
  }

  try {
    const body = await readBody(event);
    const updateData = buildDfmeaProjectUpdateData(
      body as Record<string, unknown>,
    );
    const governedFields = buildGovernedWriteFieldsForTable(
      'dfmea_projects',
      updateData,
    );

    const updatedProject = await prisma.dfmea_projects.update({
      where: { id },
      data: {
        ...updateData,
        ...governedFields,
      },
    });

    return useResponseSuccess(updatedProject);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('dfmea-projects', error, undefined, event);
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'DFMEA 项目不存在');
    }
    return internalServerErrorResponse(event, `更新失败: ${errorMessage}`);
  }
}
