import { defineEventHandler } from 'h3';
import { bom_projects_id_put } from '~/modules/planning/routes/bom/projects/[id].put.service';

export default defineEventHandler(async (event) => bom_projects_id_put(event));
