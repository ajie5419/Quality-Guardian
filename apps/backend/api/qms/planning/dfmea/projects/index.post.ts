import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  createDfmeaProjectId,
  normalizeDfmeaProjectStatus,
  normalizeDfmeaText,
  toDfmeaProjectVersionText,
} from '~/utils/dfmea';
import { awaitMockDelay } from '~/utils/index';
import prisma from '~/utils/prisma';
import { isPrismaForeignKeyError } from '~/utils/prisma-error';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await awaitMockDelay();
  try {
    const body = await readBody(event);
    const projectName = normalizeDfmeaText(body.projectName);
    const missingFields = getMissingRequiredFields({ projectName }, [
      'projectName',
    ]);
    if (missingFields.length > 0) {
      return badRequestResponse(event, '缺少必填字段: projectName');
    }

    const newProject = await prisma.dfmea_projects.create({
      data: {
        id: createDfmeaProjectId(),
        projectName,
        workOrderId: normalizeDfmeaText(body.workOrderId) || null,
        version: toDfmeaProjectVersionText(body.version),
        status: normalizeDfmeaProjectStatus(body.status),
        description: normalizeDfmeaText(body.description) || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'admin',
        isDeleted: false,
      },
    });

    return useResponseSuccess(newProject);
  } catch (error) {
    logApiError('dfmea-projects', error);
    if (isPrismaForeignKeyError(error)) {
      return badRequestResponse(event, '创建项目失败，请检查工单号是否存在');
    }
    return internalServerErrorResponse(event, '创建项目失败');
  }
});
