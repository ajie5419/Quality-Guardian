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
    status: '失败' | '成功';
    userAgent?: string;
    username: string;
  }) {
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
          (params.status === '成功' ? '登录成功' : '登录失败'),
        method: params.method || '密码登录',
      },
    });
  },

  /**
   * Get paginated login logs
   */
  async getLoginLogs(params: {
    endDate?: string;
    page?: number;
    pageSize?: number;
    startDate?: string;
    status?: string;
    username?: string;
  }) {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (params.username) {
      where.username = { contains: params.username };
    }
    if (params.status) {
      where.status = params.status;
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

    return { items, total };
  },

  /**
   * Delete a log
   */
  async deleteLog(id: string) {
    return prisma.login_logs.delete({ where: { id } });
  },

  /**
   * Batch delete logs
   */
  async batchDeleteLogs(ids: string[]) {
    return prisma.login_logs.deleteMany({
      where: { id: { in: ids } },
    });
  },
};
