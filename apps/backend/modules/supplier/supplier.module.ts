import type { ModuleDeclaration } from '~/utils/module-types';

import { startSupplierScoreWorker } from './supplier-score-worker.service';

startSupplierScoreWorker();

export const supplierModule: ModuleDeclaration = {
  name: 'supplier',
  dataScope: {
    deptFields: ['buyer'],
    selfFields: ['buyer'],
  },
};
