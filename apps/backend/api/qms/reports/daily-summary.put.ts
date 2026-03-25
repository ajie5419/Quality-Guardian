import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { formatReportDate, parseReportDate } from '~/utils/report';
import {
  badRequestResponse,
  internalServerErrorResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);
    const reportDate = parseReportDate(body?.date);
    if (!reportDate) {
      return badRequestResponse(event, '缺少或无效字段: date');
    }

    const reporter = String(body?.user || userinfo.username || '').trim();
    if (!reporter) {
      return badRequestResponse(event, '缺少或无效字段: user');
    }

    const summary = String(body?.summary || '');
    const storedSummary = JSON.stringify({ summary });

    const saved = await prisma.daily_reports.upsert({
      where: {
        date_reporter: {
          date: reportDate,
          reporter,
        },
      },
      update: {
        summary: storedSummary,
      },
      create: {
        date: reportDate,
        reporter,
        summary: storedSummary,
      },
    });

    return useResponseSuccess({
      date: formatReportDate(saved.date),
      documentItems: [],
      reporter,
      summary,
    });
  } catch (error) {
    logApiError('daily-summary-save', error);
    return internalServerErrorResponse(event, '保存日报失败');
  }
});
