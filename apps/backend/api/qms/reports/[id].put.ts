import {
  defineEventHandler,
  getRouterParam,
  readBody,
  setResponseStatus,
} from 'h3';
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

  const id = getRouterParam(event, 'id');
  if (!id) {
    setResponseStatus(event, 400);
    return useResponseError('id required');
  }

  try {
    const body = await readBody(event);
    const dataUpdate: Record<string, unknown> = {};
    if (body.status !== undefined) {
      dataUpdate.status = normalizeReportStatus(body.status);
    }
    if (body.totalInspections !== undefined)
      dataUpdate.totalInspections = parseReportNumber(body.totalInspections, 0);
    if (body.passRate !== undefined)
      dataUpdate.passRate = parseReportNumber(body.passRate, 0);
    if (body.majorDefects !== undefined)
      dataUpdate.majorDefects = parseReportNumber(body.majorDefects, 0);
    if (body.minorDefects !== undefined)
      dataUpdate.minorDefects = parseReportNumber(body.minorDefects, 0);
    if (body.date !== undefined) {
      const parsedDate = parseReportDate(body.date);
      if (!parsedDate) {
        setResponseStatus(event, 400);
        return useResponseError('invalid date');
      }
      dataUpdate.date = parsedDate;
    }
    if (body.author !== undefined) {
      dataUpdate.author = normalizeReportAuthor(body.author);
    }

    const updated = await prisma.reports.update({
      where: { id },
      data: dataUpdate,
    });

    return useResponseSuccess({
      ...updated,
      date: formatReportDate(updated.date),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('reports', error);
    setResponseStatus(
      event,
      (error as { code?: string }).code === 'P2025' ? 404 : 500,
    );
    return useResponseError(`Update failed: ${errorMessage}`);
  }
});
