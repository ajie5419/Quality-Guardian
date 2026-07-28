import type { H3Event } from 'h3';

import {
  buildProjectBomCreateData,
  mapProjectBomItem,
  normalizeBomProjectStatus,
  normalizeBomText,
  projectBomItemSelect,
} from '~/modules/planning/bom';
import {
  replaceBomRequiredProcessIdentities,
  resolveBomRequiredProcessIdentities,
} from '~/modules/planning/bom-process-identities';
import {
  applyGovernedProjectNameByTable,
  upsertPlanningProjectByWorkOrder,
} from '~/modules/planning/planning-project';
import { logApiError } from '~/utils/api-logger';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/governed-write';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';

export async function bom_index_post(event: H3Event) {
  await awaitMockDelay();
  const body = await readBody(event);
  const workOrderNumber = normalizeBomText(body.workOrderNumber);
  if (!workOrderNumber) {
    return badRequestResponse(event, '缺少必填字段: workOrderNumber');
  }

  try {
    const upsertResult = await upsertPlanningProjectByWorkOrder({
      workOrderNumber,
      findExistingByWorkOrderNumber: (value) =>
        prisma.bom_projects.findUnique({
          where: { workOrderNumber: value },
          select: { id: true, isDeleted: true },
        }),
      restoreProjectById: (id) =>
        prisma.bom_projects.update({
          where: { id },
          data: { isDeleted: false, updatedAt: new Date() },
        }),
      createProject: ({ projectName, workOrderNumber: value }) =>
        prisma.bom_projects.create({
          // governance-allow-direct-name-id: normalized through governed helper before create payload commit.
          data: applyGovernedProjectNameByTable('bom_projects', {
            workOrderNumber: value,
            projectName:
              normalizeBomText(body.projectName) || projectName || value,
            status: normalizeBomProjectStatus(body.status),
          }),
        }),
    });

    if (upsertResult.code === 'MISSING_WORK_ORDER') {
      return badRequestResponse(event, '工单不存在');
    }

    const bomProject =
      upsertResult.code === 'CONFLICT'
        ? await prisma.bom_projects.findUnique({
            where: { workOrderNumber },
            select: { id: true },
          })
        : upsertResult.data;
    if (!bomProject) {
      return internalServerErrorResponse(event, 'BOM 项目状态异常');
    }

    const processIdentities = await resolveBomRequiredProcessIdentities(body);
    const newItemPayload = buildProjectBomCreateData(workOrderNumber, {
      ...body,
      requiredProcesses: processIdentities.map((item) => item.processName),
    });
    const governedBomPayload = buildGovernedWriteFieldsForTable(
      'project_boms',
      newItemPayload,
    );
    const canonicalBomPayload = await buildGovernedCanonicalWritePairForTable(
      'project_boms',
      { ...governedBomPayload, partId: body.partId },
    );
    const newItem = await prisma.$transaction(async (tx) => {
      const created = await tx.project_boms.create({
        data: {
          ...newItemPayload,
          ...governedBomPayload,
          ...canonicalBomPayload,
        },
        select: { id: true },
      });
      await replaceBomRequiredProcessIdentities(
        tx,
        created.id,
        processIdentities,
      );
      return tx.project_boms.findUniqueOrThrow({
        where: { id: created.id },
        select: projectBomItemSelect,
      });
    });

    return useResponseSuccess({
      ...mapProjectBomItem(newItem),
      projectId: bomProject.id,
    });
  } catch (error) {
    logApiError('bom', error, undefined, event);
    return internalServerErrorResponse(event, '添加物料失败');
  }
}
