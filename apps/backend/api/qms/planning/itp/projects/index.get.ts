import { defineEventHandler } from 'h3';
import { itp_projects_index_get } from '~/modules/planning/routes/itp/projects/index.get.service';

export default defineEventHandler(async (event) =>
  itp_projects_index_get(event),
);
