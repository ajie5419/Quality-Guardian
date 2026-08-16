import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { project_docs_projects_id_delete } from '~/modules/planning/routes/project-docs/projects/[id].delete.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(
    event,
    PERMISSION_CODES.QMS.PLANNING.PROJECT_DOCS.DELETE,
  );
  return project_docs_projects_id_delete(event);
});
