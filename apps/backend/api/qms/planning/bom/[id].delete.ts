import { defineEventHandler } from 'h3';
import { bom_id_delete } from '~/modules/planning/routes/bom/[id].delete.service';

export default defineEventHandler(async (event) => bom_id_delete(event));
