import { defineEventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { year, workOrderNumber, projectName, status, supplierBrand } =
    getQuery(event);

  // Date Logic
  let dateFilter: Record<string, Date> = {};
  if (year) {
    const y = Number.parseInt(String(year));
    dateFilter = {
      gte: new Date(`${y}-01-01T00:00:00.000Z`),
      lte: new Date(`${y}-12-31T23:59:59.999Z`),
    };
  }

  try {
    const list = await prisma.after_sales.findMany({
      where: {
        isDeleted: false,
        ...(year ? { occurDate: dateFilter } : {}),
        ...(workOrderNumber
          ? { workOrderNumber: String(workOrderNumber) }
          : {}),
        ...(projectName
          ? { projectName: { contains: String(projectName) } }
          : {}),
        ...(status ? { claimStatus: String(status) } : {}),
        ...(supplierBrand
          ? {
              OR: [
                { supplierBrand: { contains: String(supplierBrand) } },
                { projectName: { contains: String(supplierBrand) } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Helper function to format date as YYYY-MM-DD
    const formatDate = (date: Date | null | undefined) => {
      if (!date) return null;
      return date.toISOString().split('T')[0];
    };

    // Map to frontend expectation with formatted dates
    const result = list.map((item) => ({
      ...item,
      issueDate: formatDate(item.occurDate),
      occurDate: formatDate(item.occurDate),
      factoryDate: formatDate(item.factoryDate),
      closeDate: formatDate(item.closeDate),
      shipDate: formatDate(item.shipDate),
      createdAt: formatDate(item.createdAt),
      responsibleDept: item.respDept,
      resolutionPlan: item.solution,
      status: item.claimStatus,
      isClaim: item.isClaim,
    }));

    return useResponseSuccess(result);
  } catch (error) {
    console.error('Failed to fetch after sales:', error);
    return useResponseSuccess([]);
  }
});
