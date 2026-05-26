import type { ModuleDeclaration } from '~/utils/module-types';

export const workOrderModule: ModuleDeclaration = {
  name: 'work-order',
  dataScope: {
    deptFields: ['division'],
    selfFields: [],
    selfFallsBackToDept: true,
  },
};
