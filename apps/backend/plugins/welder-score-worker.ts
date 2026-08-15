import { startWelderScoreWorker } from '~/modules/welder/welder-score-worker.service';

export default defineNitroPlugin(() => {
  startWelderScoreWorker();
});
