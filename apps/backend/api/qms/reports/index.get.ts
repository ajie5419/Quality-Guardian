import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { formatReportDate } from '~/utils/report';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const reports = await prisma.reports.findMany({
      orderBy: { date: 'desc' },
    });

    const items = reports.map((r) => ({
      ...r,
      date: formatReportDate(r.date),
    }));

    return useResponseSuccess(items);
  } catch (error) {
    logApiError('reports', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch reports');
  }
});
