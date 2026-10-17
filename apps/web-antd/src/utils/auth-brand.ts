/** Brand shown on the shared login/register pages for every entry system. */
export const AUTH_BRAND_NAME = '通联项目管理系统';

/** Routes that render the shared login experience and carry the brand. */
const AUTH_BRAND_ROUTE_NAMES = new Set(['Authentication', 'IdentityAuthorize']);

export function isAuthBrandRoute(
  matched: ReadonlyArray<{ name?: null | string | symbol }>,
) {
  return matched.some(
    (record) =>
      typeof record.name === 'string' &&
      AUTH_BRAND_ROUTE_NAMES.has(record.name),
  );
}

/**
 * Keeps a validated bridge `redirect` when moving between login and register,
 * so returning to login still lands on the authorize page.
 */
export function withAuthRedirect(path: string, redirect: unknown) {
  return typeof redirect === 'string' && redirect
    ? `${path}?redirect=${encodeURIComponent(redirect)}`
    : path;
}
