import type { ModuleDeclaration } from '~/utils/module-types';

import { AUDIT_TEMPLATES } from '@qgs/shared';

export const vehicleCommissioningModule: ModuleDeclaration = {
  name: 'vehicle-commissioning',
  menus: [
    {
      key: 'vehicle-commissioning',
      parentPath: '/qms',
      path: '/qms/vehicle-commissioning',
      name: 'QMSVehicleCommissioning',
      component: '/qms/vehicle-commissioning/index.vue',
      authCode: 'QMS:VehicleCommissioning:List',
      order: 95,
      type: 'menu',
      meta: {
        icon: 'carbon:vehicle-connected',
        orderNo: 95,
        title: '调试验收',
      },
    },
  ],
  audit: {
    issueCreate: {
      action: 'CREATE',
      targetType: 'vehicle_commissioning_issue',
      detailsTemplate: AUDIT_TEMPLATES.VEHICLE_COMMISSIONING_ISSUE_CREATE,
    },
    issueUpdate: {
      action: 'UPDATE',
      targetType: 'vehicle_commissioning_issue',
      detailsTemplate: AUDIT_TEMPLATES.VEHICLE_COMMISSIONING_ISSUE_UPDATE,
    },
  },
};
