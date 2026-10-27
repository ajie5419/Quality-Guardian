/**
 * Fulfillment work-order write endpoints. They authenticate the
 * identity-bridge client headers themselves, so the JWT middleware skips them
 * and the request-dedupe middleware leaves them to the versioned
 * compare-and-set (a retried cancel must stay idempotent, not 409).
 */
const FULFILLMENT_WORK_ORDER_WRITE_ROUTES: ReadonlyArray<{
  method: string;
  pattern: RegExp;
}> = [
  {
    method: 'POST',
    pattern: /^\/api\/integration\/fulfillment\/work-orders$/u,
  },
  {
    method: 'PUT',
    pattern: /^\/api\/integration\/fulfillment\/work-orders\/[^/]+$/u,
  },
  {
    method: 'POST',
    pattern: /^\/api\/integration\/fulfillment\/work-orders\/[^/]+\/cancel$/u,
  },
];

export function isFulfillmentWorkOrderWrite(method: string, pathname: string) {
  const normalizedMethod = method.toUpperCase();
  return FULFILLMENT_WORK_ORDER_WRITE_ROUTES.some(
    (route) =>
      route.method === normalizedMethod && route.pattern.test(pathname),
  );
}
