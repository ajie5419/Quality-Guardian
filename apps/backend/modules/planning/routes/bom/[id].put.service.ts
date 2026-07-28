import type { H3Event } from 'h3';

import {
  buildProjectBomMutableData,
  mapProjectBomItem,
  projectBomItemSelect,
} from '~/modules/planning/bom';
import {
  hasBomRequiredProcessIdentityUpdate,
  replaceBomRequiredProcessIdentities,
  resolveBomRequiredProcessIdentities,
} from '~/modules/planning/bom-process-identities';
import { logApiError } from '~/utils/api-logger';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
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
    const replacesProcessIdentities = hasBomRequiredProcessIdentityUpdate(body);
    const processIdentities = replacesProcessIdentities
      ? await resolveBomRequiredProcessIdentities(body)
      : null;
    const builtMutablePayload = buildProjectBomMutableData({
      ...body,
      ...(processIdentities
        ? {
            requiredProcesses: processIdentities.map(
              (item) => item.processName,
            ),
          }
        : {}),
    });
    const { required_processes: _preservedSnapshot, ...mutableFields } =
      builtMutablePayload;
    const mutablePayload = replacesProcessIdentities
      ? builtMutablePayload
      : mutableFields;
    const governedBomPayload = buildGovernedWriteFieldsForTable(
      'project_boms',
      mutablePayload,
    );
    const canonicalBomPayload = await buildGovernedCanonicalWritePairForTable(
      'project_boms',
      { ...governedBomPayload, partId: body.partId },
    );
    const updated = await prisma.$transaction(async (tx) => {
      await tx.project_boms.update({
        where: { id },
        data: {
          ...mutablePayload,
          ...governedBomPayload,
          ...canonicalBomPayload,
        },
        select: { id: true },
      });
      if (processIdentities) {
        await replaceBomRequiredProcessIdentities(tx, id, processIdentities);
      }
      return tx.project_boms.findUniqueOrThrow({
        where: { id },
        select: projectBomItemSelect,
      });
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
