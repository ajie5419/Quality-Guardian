import { defineEventHandler, getQuery } from 'h3';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 100; // Increase default pageSize for better aggregation
  const type = String(query.type || 'incoming').toUpperCase();
  const year = Number(query.year);
  const keyword = query.keyword ? String(query.keyword) : undefined;
  const projectName = query.projectName ? String(query.projectName) : undefined;
  const workOrderNumber = query.workOrderNumber
    ? String(query.workOrderNumber)
    : undefined;

  const where: Record<string, unknown> = {
    isDeleted: false,
  };

  // Only filter by category if type is not 'ALL'
  if (type !== 'ALL') {
    where.category = type;
  }

  // Explicit project/work order filtering
  if (workOrderNumber) {
    where.workOrderNumber = workOrderNumber;
  }
  if (projectName) {
    where.projectName = { contains: projectName };
  }

  if (keyword) {
    where.OR = [
      { workOrderNumber: { contains: keyword } },
      { projectName: { contains: keyword } },
      { supplierName: { contains: keyword } },
      { inspector: { contains: keyword } },
    ];
  }

  if (year) {
    where.inspectionDate = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31`),
    };
  }

  const [items, total] = await Promise.all([
    prisma.inspections.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { items: true }, // Include details for now, simplify frontend
    }),
    prisma.inspections.count({ where }),
  ]);

  return useResponseSuccess({ items, total });
});
