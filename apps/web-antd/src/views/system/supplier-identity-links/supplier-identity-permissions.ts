import { isSystemAdmin } from '@qgs/shared';

type SupplierIdentityUser = null | undefined | { roles?: unknown };

function hasSupplierIdentityPermission(
  accessCodes: readonly string[],
  user: SupplierIdentityUser,
  permission: 'Edit' | 'List',
) {
  return (
    accessCodes.includes(`System:SupplierIdentity:${permission}`) ||
    accessCodes.includes('*') ||
    accessCodes.includes('["*"]') ||
    (Array.isArray(user?.roles) &&
      user.roles.some(
        (role) =>
          typeof role === 'string' &&
          role.trim().toLowerCase().includes('super'),
      ))
  );
}

export function canViewSupplierIdentity(
  accessCodes: readonly string[],
  user: SupplierIdentityUser,
) {
  return (
    hasSupplierIdentityPermission(accessCodes, user, 'List') &&
    isSystemAdmin(user)
  );
}

export function canManageSupplierIdentity(
  accessCodes: readonly string[],
  user: SupplierIdentityUser,
) {
  return (
    hasSupplierIdentityPermission(accessCodes, user, 'Edit') &&
    isSystemAdmin(user)
  );
}
