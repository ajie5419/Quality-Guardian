import type { ModuleDeclaration } from '~/utils/module-types';

export const taskDispatchModule: ModuleDeclaration = {
  name: 'task-dispatch',
  dataScope: {
    deptFields: ['users_qms_task_dispatches_assigneeIdTousers.department'],
    selfFields: ['assigneeId', 'assignorId'],
  },
};
