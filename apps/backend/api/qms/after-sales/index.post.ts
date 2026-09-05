import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import afterSalesCreateHandler from '~/modules/after-sales/after-sales-create.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.AFTER_SALES.CREATE);
  return afterSalesCreateHandler(event);
});
