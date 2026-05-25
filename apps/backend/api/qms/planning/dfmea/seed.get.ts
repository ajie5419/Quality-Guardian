import { defineEventHandler } from 'h3';
import { dfmea_seed_get } from '~/modules/planning/routes/dfmea/seed.get.service';

export default defineEventHandler(async (event) => dfmea_seed_get(event));
