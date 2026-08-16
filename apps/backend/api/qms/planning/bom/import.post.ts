import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { bom_import_post } from '~/modules/planning/routes/bom/import.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.BOM.IMPORT);
  return bom_import_post(event);
});
