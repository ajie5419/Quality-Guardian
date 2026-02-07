import { defineEventHandler, getQuery } from 'h3';
import { InspectionService } from '~/services/inspection.service';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const page = Number(query.page) || 1;
  const pageSize = Number(query.pageSize) || 100;
  const type = String(query.type || 'incoming').toUpperCase();
  const year = Number(query.year);
  const keyword = query.keyword ? String(query.keyword) : undefined;
  const projectName = query.projectName ? String(query.projectName) : undefined;
  const workOrderNumber = query.workOrderNumber
    ? String(query.workOrderNumber)
    : undefined;

  const { items, total } = await InspectionService.findAll({
    page,
    pageSize,
    type,
    year,
    keyword,
    projectName,
    workOrderNumber,
  });

  return useResponseSuccess({ items, total });
});
