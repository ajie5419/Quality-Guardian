import { defineEventHandler } from 'h3';
import { dfmea_tree_get } from '~/modules/planning/routes/dfmea/tree.get.service';

export default defineEventHandler(async (event) => dfmea_tree_get(event));
