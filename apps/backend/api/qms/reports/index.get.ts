import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async () => {
  try {
    const reports = await prisma.reports.findMany({
      orderBy: { date: 'desc' },
    });

    const items = reports.map((r) => ({
      ...r,
      date: r.date.toISOString().split('T')[0],
    }));

    return useResponseSuccess(items);
  } catch (error) {
    logApiError('reports', error);
    return useResponseSuccess([]);
  }
});
