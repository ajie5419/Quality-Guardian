import { registerCronJob } from '~/modules/scheduler';
import { createModuleLogger } from '~/utils/logger';

import { runLifecycleArchive } from '../data-lifecycle-archive.service';

const logger = createModuleLogger('LifecycleArchive');

/**
 * Daily 02:00 lifecycle archive (data lifecycle P3):
 * marks expired business rows as archived and purges expired snapshots.
 */
async function runDailyArchive() {
  try {
    const result = await runLifecycleArchive();
    logger.info(result, 'lifecycle archive done');
  } catch (error) {
    logger.error({ err: error }, 'lifecycle archive failed');
  }
}

export function registerLifecycleArchive(): void {
  registerCronJob({
    key: 'data-lifecycle.daily-archive',
    cronExpr: '0 2 * * *',
    description: '每日 02:00 归档到期业务数据并清理超期快照（数据生命周期 P3）',
    handler: runDailyArchive,
  });
}
