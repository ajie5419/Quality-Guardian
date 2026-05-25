import { defineEventHandler } from 'h3';
import { project_docs_projects_id_delete } from '~/modules/planning/routes/project-docs/projects/[id].delete.service';

export default defineEventHandler(async (event) =>
  project_docs_projects_id_delete(event),
);
