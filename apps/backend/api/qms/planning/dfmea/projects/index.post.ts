import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { dfmea_projects_index_post } from '~/modules/planning/routes/dfmea/projects/index.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, PERMISSION_CODES.QMS.PLANNING.DFMEA.CREATE);
  return dfmea_projects_index_post(event);
});
