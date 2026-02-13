import { defineEventHandler, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { isPrismaNotFoundError } from '~/utils/prisma-error';
import {
  formatReportDate,
  normalizeReportAuthor,
  normalizeReportStatus,
  parseReportDate,
  parseReportNumber,
} from '~/utils/report';
import {
  badRequestResponse,
  internalServerErrorResponse,
  notFoundResponse,
  unAuthorizedResponse,
  useResponseSuccess,
} from '~/utils/response';
import { getRequiredRouterParam } from '~/utils/route-param';

export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const id = getRequiredRouterParam(event, 'id', 'id required');
  if (typeof id !== 'string') {
    return id;
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
        return badRequestResponse(event, 'invalid date');
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
    if (isPrismaNotFoundError(error)) {
      return notFoundResponse(event, 'Report not found');
    }
    return internalServerErrorResponse(event, `Update failed: ${errorMessage}`);
  }
});
