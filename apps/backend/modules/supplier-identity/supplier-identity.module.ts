import type { ModuleDeclaration } from '~/utils/module-types';

export const supplierIdentityModule: ModuleDeclaration = {
  name: 'supplier-identity',
  menus: [
    {
      key: 'system-supplier-identity-links',
      parentPath: '/system',
      path: '/system/supplier-identity-links',
      name: 'SystemSupplierIdentityLinks',
      component: 'system/supplier-identity-links/index',
      authCode: 'System:SupplierIdentity:List',
      order: 10,
      type: 'menu',
      meta: {
        icon: 'carbon:collaborate',
        title: 'Supplier Identity Mappings',
      },
      buttons: [
        {
          authCode: 'System:SupplierIdentity:Edit',
          name: 'SystemSupplierIdentityEdit',
          order: 1,
          title: 'Manage Mappings',
        },
      ],
    },
  ],
};
