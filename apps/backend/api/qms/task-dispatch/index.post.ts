import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaForeignKeyError } from '~/utils/prisma-error';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';
import {
  resolveTaskDispatchCurrentUserId,
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
    setResponseStatus(event, 400);
    return useResponseError(`缺少必填字段: ${missingFields.join('/')}`);
  }

  const currentUserId = await resolveTaskDispatchCurrentUserId(
    userinfo,
    prisma,
  );
  if (!currentUserId) {
    setResponseStatus(event, 400);
    return useResponseError('无法识别当前操作人身份');
  }

  try {
    const assignee = await prisma.users.findFirst({
      where: {
        OR: [
          { id: String(body.assigneeId) },
          { username: String(body.assigneeId) },
        ],
      },
      select: { id: true },
    });
    if (!assignee) {
      setResponseStatus(event, 400);
      return useResponseError('受派人不存在');
    }

    // 校验关联的 ITP 项目是否存在 (真实数据库外键约束预检)
    if (body.type === 'ITP_INSPECTION' && body.itpProjectId) {
      const project = await prisma.quality_plans.findUnique({
        where: { id: String(body.itpProjectId) },
      });
      if (!project) {
        logApiError('task-dispatch', new Error('Project not found'), {
          itpProjectId: body.itpProjectId,
        });
        setResponseStatus(event, 400);
        return useResponseError(
          `关联的 ITP 计划 (ID: ${body.itpProjectId}) 不存在，请刷新后重试`,
        );
      }
    }

    const newTask = await prisma.qms_task_dispatches.create({
      data: {
        type: String(body.type),
        title: String(body.title),
        level: Number(body.level) || 1,
        parentId: body.parentId ? String(body.parentId) : null,
        itpProjectId: body.itpProjectId ? String(body.itpProjectId) : null,
        dfmeaId: body.dfmeaId ? String(body.dfmeaId) : null,
        assignorId: currentUserId,
        assigneeId: assignee.id,
        content: body.content ? String(body.content) : null,
        priority: Number(body.priority) || 2,
        dueDate: body.deadline ? new Date(body.deadline) : null,
        updatedAt: new Date(),
      },
    });

    // 如果是二级指派，更新父任务状态
    if (body.level === 2 && body.parentId) {
      await prisma.qms_task_dispatches.update({
        where: { id: String(body.parentId) },
        data: { status: TASK_DISPATCH_STATUS.DISPATCHED },
      });
    }

    return useResponseSuccess(newTask);
  } catch (error: unknown) {
    logApiError('task-dispatch', error);
    const err = error as { code?: string; message?: string };
    setResponseStatus(event, isPrismaForeignKeyError(error) ? 400 : 500);
    return useResponseError(`派发失败: ${err.message || '数据库写入异常'}`);
  }
});
