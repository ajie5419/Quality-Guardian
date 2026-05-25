import { defineEventHandler } from 'h3';
import { itp_tree_get } from '~/modules/planning/routes/itp/tree.get.service';

export default defineEventHandler(async (event) => itp_tree_get(event));
