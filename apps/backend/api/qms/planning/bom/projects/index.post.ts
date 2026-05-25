import { defineEventHandler } from 'h3';
import { bom_projects_index_post } from '~/modules/planning/routes/bom/projects/index.post.service';

export default defineEventHandler(async (event) =>
  bom_projects_index_post(event),
);
