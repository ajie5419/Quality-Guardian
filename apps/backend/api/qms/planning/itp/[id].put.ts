import { defineEventHandler } from 'h3';
import { itp_id_put } from '~/modules/planning/routes/itp/[id].put.service';

export default defineEventHandler(async (event) => itp_id_put(event));
