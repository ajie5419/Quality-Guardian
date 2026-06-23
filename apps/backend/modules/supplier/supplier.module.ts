import type { ModuleDeclaration } from '~/utils/module-types';

import { registerSupplierEventListeners } from './supplier-event-listener';

// Register event listeners as a side-effect of loading the module
// declaration. module-loader.ts imports this file at startup, so any
// emitter inside the process gets a subscriber before the first request.
registerSupplierEventListeners();

export const supplierModule: ModuleDeclaration = {
  name: 'supplier',
  dataScope: {
    deptFields: ['buyer'],
    selfFields: ['buyer'],
  },
};
