import { defineEventHandler } from 'h3';
import { itp_id_delete } from '~/modules/planning/routes/itp/[id].delete.service';

export default defineEventHandler(async (event) => itp_id_delete(event));
