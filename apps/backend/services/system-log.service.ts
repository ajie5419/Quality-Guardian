import type {
  AuditLog,
  AuditLogPageResult,
  AuditLogParams,
  LoginLog,
  LoginLogPageResult,
  LoginLogParams,
} from '@qgs/shared';

import { Prisma } from '@prisma/client';
import { LoginMethodEnum, LoginStatusEnum } from '@qgs/shared';
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

  /**
   * Record an audit log for business operations
   */
  async recordAuditLog(params: {
    action: any;
    details?: string;
    ipAddress?: string;
    targetId: string;
    targetType: string;
    userAgent?: string;
    userId: string;
  }): Promise<any> {
    return (prisma.audit_logs as any).create({
      data: {
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        details: params.details,
        ipAddress: params.ipAddress || 'Unknown',
        userAgent: params.userAgent || 'Unknown',
      } as any,
    });
  },

  /**
   * Get paginated audit logs
   */
  async getAuditLogs(params: AuditLogParams): Promise<AuditLogPageResult> {
    const page = Number(params.page) || 1;
    const pageSize = Number(params.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.audit_logsWhereInput = {};
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.action) {
      where.action = params.action as any;
    }
    if (params.targetType) {
      where.targetType = { contains: params.targetType };
    }
    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const [items, total] = await Promise.all([
      prisma.audit_logs.findMany({
        where,
        include: {
          users: {
            select: {
              username: true,
              realName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.audit_logs.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        timestamp: String(item.timestamp),
        username: item.users?.realName || item.users?.username || 'Unknown',
      })) as any as AuditLog[],
      total,
    };
  },

  /**
   * Delete an audit log
   */
  async deleteAuditLog(id: string): Promise<any> {
    return prisma.audit_logs.delete({ where: { id } });
  },

  /**
   * Batch delete audit logs
   */
  async batchDeleteAuditLogs(ids: string[]): Promise<Prisma.BatchPayload> {
    return prisma.audit_logs.deleteMany({
      where: { id: { in: ids } },
    });
  },
};
