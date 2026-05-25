import { defineEventHandler } from 'h3';
import { bom_tree_get } from '~/modules/planning/routes/bom/tree.get.service';

export default defineEventHandler(async (event) => bom_tree_get(event));
