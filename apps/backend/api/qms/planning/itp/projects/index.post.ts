import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { awaitMockDelay } from '~/utils/index';
import { buildItpProjectCreateData, normalizeItpText } from '~/utils/itp';
import { isPrismaForeignKeyError } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  const body = await readBody(event);
  const projectName = normalizeItpText(body.projectName);
  const missingFields = getMissingRequiredFields({ projectName }, [
    'projectName',
  ]);
  if (missingFields.length > 0) {
    return badRequestResponse(event, `缺少必填字段: ${missingFields[0]}`);
  }

  try {
    const newProject = await prisma.quality_plans.create({
      data: buildItpProjectCreateData(body as Record<string, unknown>),
    });

    return useResponseSuccess({
      ...newProject,
      status: newProject.planStatus?.toLowerCase(),
      workOrderId: newProject.workOrderNumber,
    });
  } catch (error: unknown) {
    logApiError('itp-project-create', error);
    if (isPrismaForeignKeyError(error)) {
      return badRequestResponse(event, '关联工单不存在');
    }
    return internalServerErrorResponse(event, '创建 ITP 项目失败');
  }
});
