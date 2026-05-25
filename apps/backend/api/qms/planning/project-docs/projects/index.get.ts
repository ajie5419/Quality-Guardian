import { defineEventHandler } from 'h3';
import { project_docs_projects_index_get } from '~/modules/planning/routes/project-docs/projects/index.get.service';

export default defineEventHandler(async (event) =>
  project_docs_projects_index_get(event),
);
