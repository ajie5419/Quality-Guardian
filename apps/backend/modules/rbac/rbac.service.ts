import { RbacMenuService } from './rbac-menu.service';
import { RbacRoleService } from './rbac-role.service';

export const RbacService = {
  ...RbacMenuService,
  ...RbacRoleService,
};
