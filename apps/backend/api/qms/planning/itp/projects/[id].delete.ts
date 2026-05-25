import { defineEventHandler } from 'h3';
import { itp_projects_id_delete } from '~/modules/planning/routes/itp/projects/[id].delete.service';

export default defineEventHandler(async (event) =>
  itp_projects_id_delete(event),
);
