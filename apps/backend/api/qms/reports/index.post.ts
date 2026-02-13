import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  formatReportDate,
  normalizeReportAuthor,
  normalizeReportStatus,
  parseReportDate,
  parseReportNumber,
} from '~/utils/report';
import { getMissingRequiredFields } from '~/utils/request-validation';
import {
  badRequestResponse,
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
    const body = await readBody(event);
    const missingFields = getMissingRequiredFields(body, ['date']);
    const reportDate =
      missingFields.length > 0 ? null : parseReportDate(body.date);
    if (!reportDate) {
      return badRequestResponse(event, '缺少或无效字段: date');
    }

    const created = await prisma.reports.create({
      data: {
        author:
          normalizeReportAuthor(body.author) ||
          userinfo.realName ||
          userinfo.username,
        date: reportDate,
        majorDefects: parseReportNumber(body.majorDefects, 0),
        minorDefects: parseReportNumber(body.minorDefects, 0),
        passRate: parseReportNumber(body.passRate, 0),
        status: normalizeReportStatus(body.status),
        totalInspections: parseReportNumber(body.totalInspections, 0),
      },
    });

    return useResponseSuccess({
      ...created,
      date: formatReportDate(created.date),
    });
  } catch (error) {
    logApiError('reports', error);
    setResponseStatus(event, 500);
    return useResponseError('创建报告失败');
  }
});
