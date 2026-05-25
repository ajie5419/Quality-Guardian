import { defineEventHandler } from 'h3';
import { dfmea_projects_index_get } from '~/modules/planning/routes/dfmea/projects/index.get.service';

export default defineEventHandler(async (event) =>
  dfmea_projects_index_get(event),
);
