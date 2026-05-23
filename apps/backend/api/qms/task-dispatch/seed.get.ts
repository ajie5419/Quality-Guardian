import { defineEventHandler } from 'h3';
import {
  buildGovernedCanonicalWritePairForTable,
  buildGovernedWriteFieldsForTable,
} from '~/utils/master-data-governance-write';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    const users = await prisma.users.findMany({ take: 3 });
    if (users.length === 0) {
      return internalServerErrorResponse(event, 'No users');
    }

    const admin = users[0];
    const firstSeedTask = {
      type: 'ITP_INSPECTION',
      title: '2026年度桥梁支座组焊 ITP 项目检验',
      level: 1,
      assignorId: String(admin.id),
      assigneeId: String(admin.id),
      priority: 3,
      status: 'PENDING',
      itpProjectId: 'ITP-PRJ-001',
      dueDate: new Date('2026-06-30'),
      updatedAt: new Date(),
    };
    const secondSeedTask = {
      type: 'DFMEA_ACTION',
      title: 'DFMEA-202601: 传动轴振动失效改进措施执行',
      level: 1,
      assignorId: String(admin.id),
      assigneeId: String(admin.id),
      priority: 2,
      status: 'PENDING',
      dfmeaId: 'DFM-001',
      dueDate: new Date('2026-03-15'),
      updatedAt: new Date(),
    };
    const firstSeedCanonicalIds = await buildGovernedCanonicalWritePairForTable(
      'qms_task_dispatches',
      firstSeedTask as Record<string, unknown>,
    );
    const secondSeedCanonicalIds =
      await buildGovernedCanonicalWritePairForTable(
        'qms_task_dispatches',
        secondSeedTask as Record<string, unknown>,
      );

    await prisma.qms_task_dispatches.createMany({
      data: [
        {
          ...firstSeedTask,
          ...buildGovernedWriteFieldsForTable(
            'qms_task_dispatches',
            firstSeedTask,
          ),
          ...firstSeedCanonicalIds,
        },
        {
          ...secondSeedTask,
          ...buildGovernedWriteFieldsForTable(
            'qms_task_dispatches',
            secondSeedTask,
          ),
          ...secondSeedCanonicalIds,
        },
      ],
    });

    return useResponseSuccess({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Seed failed';
    return internalServerErrorResponse(event, message);
  }
});
