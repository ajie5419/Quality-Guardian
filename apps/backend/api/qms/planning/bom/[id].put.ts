import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { bom_id_put } from '~/modules/planning/routes/bom/[id].put.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.BOM.EDIT);
  return bom_id_put(event);
});
