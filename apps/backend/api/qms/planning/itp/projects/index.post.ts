import { defineEventHandler } from 'h3';
import { itp_projects_index_post } from '~/modules/planning/routes/itp/projects/index.post.service';

export default defineEventHandler(async (event) =>
  itp_projects_index_post(event),
);
