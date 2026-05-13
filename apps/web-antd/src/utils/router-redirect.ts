const LEGACY_HASH_ROUTE_PATHS = new Set([
  '/qms/inspection/requests',
  '/qms/inspection/requests/entry',
  '/qms/metrology/borrow/entry',
]);

export function normalizeHashRedirectPath(target: string) {
  if (import.meta.env.VITE_ROUTER_HISTORY !== 'hash') {
    return target;
  }

  if (target.startsWith('/#/')) {
    return target.slice(2);
  }

  if (target.startsWith('#/')) {
    return target.slice(1);
  }

  return target;
}

export function redirectLegacyHashRoute() {
  if (typeof window === 'undefined') {
    return;
  }

  if (import.meta.env.VITE_ROUTER_HISTORY !== 'hash') {
    return;
  }

  if (!LEGACY_HASH_ROUTE_PATHS.has(window.location.pathname)) {
    return;
  }

  const target = `${window.location.origin}/#${window.location.pathname}${window.location.search}`;
  window.location.replace(target);
}
