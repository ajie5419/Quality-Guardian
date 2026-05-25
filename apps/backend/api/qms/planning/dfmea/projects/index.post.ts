import { defineEventHandler } from 'h3';
import { dfmea_projects_index_post } from '~/modules/planning/routes/dfmea/projects/index.post.service';

export default defineEventHandler(async (event) =>
  dfmea_projects_index_post(event),
);
