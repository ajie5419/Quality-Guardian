import { defineEventHandler } from 'h3';
import { bom_index_get } from '~/modules/planning/routes/bom/index.get.service';

export default defineEventHandler(async (event) => bom_index_get(event));
