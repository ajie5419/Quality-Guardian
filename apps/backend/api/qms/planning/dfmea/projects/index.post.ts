import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import {
  createDfmeaProjectId,
  normalizeDfmeaProjectStatus,
  normalizeDfmeaText,
  toDfmeaProjectVersionText,
} from '~/utils/dfmea';
import { MOCK_DELAY } from '~/utils/index';
import { isPrismaForeignKeyError } from '~/utils/planning-project';
import prisma from '~/utils/prisma';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
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
    setResponseStatus(event, isPrismaForeignKeyError(error) ? 400 : 500);
    return useResponseError(
      isPrismaForeignKeyError(error)
        ? '创建项目失败，请检查工单号是否存在'
        : '创建项目失败',
    );
  }
});
