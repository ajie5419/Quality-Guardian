const DISPATCH_ROLE_KEYWORDS = [
  'super',
  'admin',
  'dispatch',
  'manager',
  'schedule',
] as const;

function normalizeRole(role: string): string {
  return role
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, '');
}

export function canDispatchByRoles(roles: string[] = []): boolean {
  return roles.some((role) => {
    const normalized = normalizeRole(role);
    return DISPATCH_ROLE_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    );
  });
}
