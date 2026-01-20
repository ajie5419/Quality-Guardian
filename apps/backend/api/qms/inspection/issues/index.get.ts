import { defineEventHandler, getQuery } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const { supplierName, year } = getQuery(event);

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
    const records = await prisma.quality_records.findMany({
      where: {
        isDeleted: false,
        ...(year ? { date: dateFilter } : {}),
        ...(supplierName
          ? {
              OR: [
                { supplierName: String(supplierName) },
                { supplierName: { contains: String(supplierName) } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        work_orders: {
          select: {
            workOrderNumber: true,
            customerName: true,
            projectName: true,
            division: true,
            status: true,
          },
        },
        users_quality_records_inspectorTousers: true, // Include inspector user
      },
    });

    // Map fields to match frontend expectation (Mock structure)
    const result = records.map((item) => {
      let photos = [];
      try {
        if (item.issuePhoto) {
          const parsed = JSON.parse(item.issuePhoto);
          photos = Array.isArray(parsed) ? parsed : [];
        }
      } catch {
        // Ignore parse errors
      }

      return {
        ...item,
        ncNumber: item.nonConformanceNumber,
        reportDate: item.date.toISOString().split('T')[0],
        reportedBy:
          item.users_quality_records_inspectorTousers?.realName ||
          item.users_quality_records_inspectorTousers?.username ||
          '',
        claim: item.isClaim ? 'Yes' : 'No',
        photos,
      };
    });

    return useResponseSuccess(result);
  } catch (error) {
    console.error('Failed to fetch inspection issues:', error);
    return useResponseSuccess([]);
  }
});
