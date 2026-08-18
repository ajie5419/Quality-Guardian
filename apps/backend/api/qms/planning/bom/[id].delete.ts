import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { bom_id_delete } from '~/modules/planning/routes/bom/[id].delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.BOM.DELETE);
  return bom_id_delete(event);
});
