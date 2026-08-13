import { startQualityLossIndexWorker } from '~/modules/quality-loss/quality-loss-index-worker.service';

export default defineNitroPlugin(() => {
  startQualityLossIndexWorker();
});
