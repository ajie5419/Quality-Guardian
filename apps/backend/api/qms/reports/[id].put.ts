import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('id required');

  const body = await readBody(event);

  try {
    const dataUpdate: Record<string, unknown> = {};
    if (body.status) dataUpdate.status = body.status;
    if (body.totalInspections !== undefined)
      dataUpdate.totalInspections = Number(body.totalInspections);
    if (body.passRate !== undefined)
      dataUpdate.passRate = Number(body.passRate);
    if (body.majorDefects !== undefined)
      dataUpdate.majorDefects = Number(body.majorDefects);
    if (body.minorDefects !== undefined)
      dataUpdate.minorDefects = Number(body.minorDefects);
    if (body.date) dataUpdate.date = new Date(body.date);
    if (body.author) dataUpdate.author = body.author;

    const updated = await prisma.reports.update({
      where: { id },
      data: dataUpdate,
    });

    return useResponseSuccess({
      ...updated,
      date: updated.date.toISOString().split('T')[0],
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('reports', error);
    return useResponseError(`Update failed: ${errorMessage}`);
  }
});
