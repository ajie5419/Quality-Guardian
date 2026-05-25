import { defineEventHandler } from 'h3';
import { dfmea_projects_id_put } from '~/modules/planning/routes/dfmea/projects/[id].put.service';

export default defineEventHandler(async (event) =>
  dfmea_projects_id_put(event),
);
