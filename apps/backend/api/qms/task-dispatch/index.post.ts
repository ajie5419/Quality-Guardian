import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaForeignKeyError } from '~/utils/prisma-error';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import {
  buildTaskDispatchCreateData,
  isTaskDispatchLevelTwo,
  resolveTaskDispatchAssigneeCandidates,
  resolveTaskDispatchCurrentUserId,
  resolveTaskDispatchItpProjectIdForValidation,
  resolveTaskDispatchParentIdForPromotion,
  TASK_DISPATCH_STATUS,
} from '~/utils/task-dispatch';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const body = (await readBody(event)) as {
    assigneeId?: unknown;
    content?: unknown;
    deadline?: string;
    dfmeaId?: unknown;
    itpProjectId?: unknown;
    level?: unknown;
    parentId?: unknown;
    priority?: unknown;
    title?: unknown;
    type?: unknown;
  };

  const missingFields = getMissingRequiredFields(body, [
    'type',
    'title',
    'assigneeId',
  ]);
  if (missingFields.length > 0) {
    return badRequestResponse(
      event,
      `缺少必填字段: ${missingFields.join('/')}`,
    );
  }

  const currentUserId = await resolveTaskDispatchCurrentUserId(
    userinfo,
    prisma,
  );
  if (!currentUserId) {
    return badRequestResponse(event, '无法识别当前操作人身份');
  }

  try {
    const assigneeCandidates = resolveTaskDispatchAssigneeCandidates(
      body.assigneeId,
    );
    if (!assigneeCandidates) {
      return badRequestResponse(event, '受派人不存在');
    }

    const assignee = await prisma.users.findFirst({
      where: {
        OR: [
          { id: assigneeCandidates.id },
          { username: assigneeCandidates.username },
        ],
      },
      select: { id: true },
    });
    if (!assignee) {
      return badRequestResponse(event, '受派人不存在');
    }

    // 校验关联的 ITP 项目是否存在 (真实数据库外键约束预检)
    const itpProjectId = resolveTaskDispatchItpProjectIdForValidation(body);
    if (itpProjectId) {
      const project = await prisma.quality_plans.findUnique({
        where: { id: itpProjectId },
      });
      if (!project) {
        logApiError('task-dispatch', new Error('Project not found'), {
          itpProjectId,
        });
        return badRequestResponse(
          event,
          `关联的 ITP 计划 (ID: ${itpProjectId}) 不存在，请刷新后重试`,
        );
      }
    }

    const isLevelTwoTask = isTaskDispatchLevelTwo(body);
    const parentIdForPromotion = resolveTaskDispatchParentIdForPromotion(body);
    if (isLevelTwoTask && !parentIdForPromotion) {
      return badRequestResponse(event, '二级任务必须提供父任务ID');
    }
    if (parentIdForPromotion) {
      const parentTask = await prisma.qms_task_dispatches.findUnique({
        where: { id: parentIdForPromotion },
        select: { id: true, level: true },
      });
      if (!parentTask) {
        return badRequestResponse(event, '父任务不存在');
      }
      if (parentTask.level !== 1) {
        return badRequestResponse(event, '仅允许挂载到一级任务');
      }
    }

    const newTask = await prisma.$transaction(async (tx) => {
      const createdTask = await tx.qms_task_dispatches.create({
        data: buildTaskDispatchCreateData(body, {
          assigneeId: assignee.id,
          assignorId: currentUserId,
        }),
      });

      // 如果是二级指派，且父任务仍为待处理，则推进为已派发
      if (parentIdForPromotion) {
        await tx.qms_task_dispatches.updateMany({
          where: {
            id: parentIdForPromotion,
            status: TASK_DISPATCH_STATUS.PENDING,
          },
          data: { status: TASK_DISPATCH_STATUS.DISPATCHED },
        });
      }

      return createdTask;
    });

    return useResponseSuccess(newTask);
  } catch (error: unknown) {
    logApiError('task-dispatch', error);
    const err = error as { code?: string; message?: string };
    if (isPrismaForeignKeyError(error)) {
      return badRequestResponse(
        event,
        `派发失败: ${err.message || '外键约束异常'}`,
      );
    }
    return internalServerErrorResponse(
      event,
      `派发失败: ${err.message || '数据库写入异常'}`,
    );
  }
});
