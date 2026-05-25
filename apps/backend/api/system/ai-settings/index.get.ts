import { defineEventHandler } from 'h3';
import { SystemService } from '~/modules/system/system.service';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async () =>
  useResponseSuccess(await SystemService.getAiSettings()),
);
