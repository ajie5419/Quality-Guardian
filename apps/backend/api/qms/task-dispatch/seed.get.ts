import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default defineEventHandler(async (_event) => {
  try {
    const users = await prisma.users.findMany({ take: 3 });
    if (users.length === 0) return { success: false, message: 'No users' };

    const admin = users[0];

    await prisma.qms_task_dispatches.createMany({
      data: [
        {
          type: 'ITP_INSPECTION',
          title: '2026年度桥梁支座组焊 ITP 项目检验',
          level: 1,
          assignorId: String(admin.id),
          assigneeId: String(admin.id),
          priority: 3,
          status: 'PENDING',
          itpProjectId: 'ITP-PRJ-001',
          deadline: new Date('2026-06-30'),
          updatedAt: new Date(),
        },
        {
          type: 'DFMEA_ACTION',
          title: 'DFMEA-202601: 传动轴振动失效改进措施执行',
          level: 1,
          assignorId: String(admin.id),
          assigneeId: String(admin.id),
          priority: 2,
          status: 'PENDING',
          dfmeaId: 'DFM-001',
          deadline: new Date('2026-03-15'),
          updatedAt: new Date(),
        },
      ],
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
