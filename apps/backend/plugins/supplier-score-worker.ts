import { startSupplierScoreWorker } from '~/modules/supplier';

export default defineNitroPlugin(() => {
  startSupplierScoreWorker();
});
