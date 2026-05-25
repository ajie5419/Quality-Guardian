import { defineEventHandler } from 'h3';
import { dfmea_projects_id_stats_get } from '~/modules/planning/routes/dfmea/projects/[id]/stats.get.service';

export default defineEventHandler(async (event) =>
  dfmea_projects_id_stats_get(event),
);
