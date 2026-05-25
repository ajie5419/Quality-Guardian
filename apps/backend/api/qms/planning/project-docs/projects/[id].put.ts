import { defineEventHandler } from 'h3';
import { project_docs_projects_id_put } from '~/modules/planning/routes/project-docs/projects/[id].put.service';

export default defineEventHandler(async (event) =>
  project_docs_projects_id_put(event),
);
