import { defineEventHandler } from 'h3';
import { bom_projects_id_delete } from '~/modules/planning/routes/bom/projects/[id].delete.service';

export default defineEventHandler(async (event) =>
  bom_projects_id_delete(event),
);
