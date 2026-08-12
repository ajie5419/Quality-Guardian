import { startQualityLossIndexWorker } from '~/modules/quality-loss';

export default defineNitroPlugin(() => {
  startQualityLossIndexWorker();
});
