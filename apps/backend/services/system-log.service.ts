import { Prisma } from '@prisma/client';
import {
  LoginMethodEnum,
  LoginStatusEnum,
  type LoginLog,
  type LoginLogPageResult,
  type LoginLogParams,
} from '@qgs/shared';

import prisma from '~/utils/prisma';
import { parseUA } from '~/utils/ua-parser';

export const SystemLogService = {
  /**
   * Record a login event
   */
  async recordLogin(params: {
    ip?: string;
    message?: string;
    method?: string;
    status: LoginStatusEnum;
    userAgent?: string;
    username: string;
  }): Promise<LoginLog> {
    const { browser, os, device } = parseUA(params.userAgent);

    return prisma.login_logs.create({
      data: {
        username: params.username,
        ip: params.ip || 'Unknown',
        browser,
        os,
        device,
        status: params.status,
        message:
          params.message ||
          (params.status === LoginStatusEnum.SUCCESS ? '登录成功' : '登录失败'),
        method: params.method || LoginMethodEnum.PASSWORD,
      },
    });
  },

  /**
   * Get paginated login logs
   */
  async getLoginLogs(params: LoginLogParams): Promise<LoginLogPageResult> {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.login_logsWhereInput = {};
    if (params.username?.trim()) {
      where.username = { contains: params.username.trim() };
    }
    if (params.status?.trim()) {
      where.status = params.status.trim();
    }
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const [items, total] = await Promise.all([
      prisma.login_logs.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.login_logs.count({ where }),
    ]);

    return {
      items: items as any as LoginLog[],
      total,
    };
  },

  /**
   * Delete a log
   */
  async deleteLog(id: string): Promise<LoginLog> {
    return prisma.login_logs.delete({ where: { id } });
  },

  /**
   * Batch delete logs
   */
  async batchDeleteLogs(ids: string[]): Promise<Prisma.BatchPayload> {
    return prisma.login_logs.deleteMany({
      where: { id: { in: ids } },
    });
  },
};
