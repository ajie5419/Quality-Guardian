import type { ModuleDeclaration } from '~/utils/module-types';

export const supplierModule: ModuleDeclaration = {
  name: 'supplier',
  dataScope: {
    deptFields: ['buyer'],
    selfFields: ['buyer'],
  },
};
