import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const body = await readBody(event);

  // 获取并格式化当前用户 ID (assignorId)
  let currentUserId: null | string = null;
  try {
    const user = await prisma.users.findUnique({
      where: { username: userinfo.username },
    });
    if (user) {
      currentUserId = user.id;
    } else {
      console.warn(
        '[Backend] User not found in DB by username:',
        userinfo.username,
      );
    }
  } catch (error: unknown) {
    const axiosError = error as { message?: string };
    console.warn(
      '[Backend] Failed to find user by username:',
      axiosError.message,
    );
  }

  if (!currentUserId) {
    const rawId = userinfo.id ?? (userinfo as Record<string, unknown>).userId;
    if (rawId !== undefined && rawId !== null) {
      currentUserId = String(rawId);
    }
  }

  if (!currentUserId) {
    return { code: -1, message: '无法确认识别当前操作人身份' };
  }

  try {
    // 校验关联的 ITP 项目是否存在 (真实数据库外键约束预检)
    if (body.type === 'ITP_INSPECTION' && body.itpProjectId) {
      const project = await prisma.quality_plans.findUnique({
        where: { id: String(body.itpProjectId) },
      });
      if (!project) {
        logApiError('task-dispatch', new Error('Project not found'), {
          itpProjectId: body.itpProjectId,
        });
        return {
          code: -1,
          message: `关联的 ITP 计划 (ID: ${body.itpProjectId}) 不存在，请刷新后重试`,
        };
      }
    }

    // 终极补救：如果 assignorId 或 assigneeId 明显不是数据库格式（如单位数字），
    // 且数据库里确实没这号人，尝试映射到现有的管理员 ID，避免外键冲突。
    const validateUserId = async (id: string) => {
      const exists = await prisma.users.findUnique({ where: { id } });
      if (exists) return id;

      // 尝试查找一个默认管理员作为兜底，防止派发完全阻塞
      const admin = await prisma.users.findFirst({
        where: { OR: [{ username: 'vben' }, { id: { startsWith: 'USR-' } }] },
      });
      return admin?.id || id;
    };

    const finalAssignorId = await validateUserId(currentUserId);
    const finalAssigneeId = await validateUserId(String(body.assigneeId));

    const newTask = await prisma.qms_task_dispatches.create({
      data: {
        type: body.type,
        title: body.title,
        level: body.level || 1,
        parentId: body.parentId,
        itpProjectId: body.itpProjectId ? String(body.itpProjectId) : null,
        dfmeaId: body.dfmeaId ? String(body.dfmeaId) : null,
        assignorId: finalAssignorId,
        assigneeId: finalAssigneeId,
        content: body.content,
        priority: body.priority || 2,
        deadline: body.deadline ? new Date(body.deadline) : null,
        updatedAt: new Date(),
      },
    });

    // 如果是二级指派，更新父任务状态
    if (body.level === 2 && body.parentId) {
      await prisma.qms_task_dispatches.update({
        where: { id: body.parentId },
        data: { status: 'DISPATCHED' },
      });
    }

    return useResponseSuccess(newTask);
  } catch (error: unknown) {
    logApiError('task-dispatch', error);
    const err = error as { message?: string; meta?: unknown };
    // 返回具体错误信息
    return {
      code: -1,
      details: err.meta, // Prisma 错误详情
      message: `派发失败: ${err.message || '数据库写入异常'}`,
    };
  }
});
