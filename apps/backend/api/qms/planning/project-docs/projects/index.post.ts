import { PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler } from 'h3';
import { project_docs_projects_index_post } from '~/modules/planning/routes/project-docs/projects/index.post.service';
import { authorizeWrite } from '~/modules/rbac';

export default defineEventHandler(async (event) => {
  await authorizeWrite(
    event,
    PERMISSION_CODES.QMS.PLANNING.PROJECT_DOCS.CREATE,
  );
  return project_docs_projects_index_post(event);
});
