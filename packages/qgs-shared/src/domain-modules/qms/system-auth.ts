function normalizeRoleText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isAdminRole(role: unknown): boolean {
  const normalizedRole = normalizeRoleText(role);
  return normalizedRole.includes('admin') || normalizedRole.includes('super');
}

export function isSystemAdmin(
  userinfo:
    | null
    | undefined
    | {
        roles?: unknown;
      },
): boolean {
  if (!userinfo || !Array.isArray(userinfo.roles)) {
    return false;
  }

  return userinfo.roles.some((role) => isAdminRole(role));
}
