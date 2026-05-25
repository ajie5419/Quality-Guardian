import { defineEventHandler } from 'h3';
import { bom_id_put } from '~/modules/planning/routes/bom/[id].put.service';

export default defineEventHandler(async (event) => bom_id_put(event));
