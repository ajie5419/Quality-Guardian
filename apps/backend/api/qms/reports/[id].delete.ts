import { defineEventHandler, getRouterParam } from 'h3';
import prisma from '~/utils/prisma';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id) return useResponseError('id required');

  try {
    await prisma.reports.delete({
      where: { id },
    });
    return useResponseSuccess({ message: 'Deleted' });
  } catch (error) {
    console.error('Delete report failed:', error);
    if (error.code === 'P2025') {
      return useResponseError('Report not found');
    }
    return useResponseError(`Delete failed: ${error.message}`);
  }
});
