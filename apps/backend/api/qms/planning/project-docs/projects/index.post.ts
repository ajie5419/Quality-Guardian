import { defineEventHandler } from 'h3';
import { project_docs_projects_index_post } from '~/modules/planning/routes/project-docs/projects/index.post.service';

export default defineEventHandler(async (event) =>
  project_docs_projects_index_post(event),
);
