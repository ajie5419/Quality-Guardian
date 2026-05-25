import { defineEventHandler } from 'h3';
import { dfmea_projects_id_delete } from '~/modules/planning/routes/dfmea/projects/[id].delete.service';

export default defineEventHandler(async (event) =>
  dfmea_projects_id_delete(event),
);
