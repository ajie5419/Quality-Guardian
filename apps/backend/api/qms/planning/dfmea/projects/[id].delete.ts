import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { dfmea_projects_id_delete } from '~/modules/planning/routes/dfmea/projects/[id].delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.DFMEA.DELETE);
  return dfmea_projects_id_delete(event);
});
